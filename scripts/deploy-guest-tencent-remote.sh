#!/usr/bin/env bash
set -euo pipefail

release_name="${1:-}"
commit="${2:-}"
expected_asset="${3:-}"

if [[ ! "$release_name" =~ ^[0-9]{8}-[0-9]{6}-[0-9a-f]{12}$ ]]; then
  echo "发布名称无效。" >&2
  exit 2
fi
if [[ ! "$commit" =~ ^[0-9a-f]{40}$ ]]; then
  echo "提交编号无效。" >&2
  exit 2
fi
if [[ ! "$expected_asset" =~ ^/llm-space-web/assets/index-[A-Za-z0-9_-]+\.js$ ]]; then
  echo "主脚本路径无效。" >&2
  exit 2
fi

release="/srv/llm-space-web/releases/$release_name"
archive="/tmp/$release_name.tgz"
environment_file="/etc/llm-space-web.env"
current_link="/srv/llm-space-web/current"
web_link="/var/www/llm-space-web"
previous_current="$(readlink -f "$current_link")"
previous_web="$(readlink -f "$web_link")"
environment_backup="$environment_file.bak-$release_name"
switched=0

on_exit() {
  status="$?"
  trap - EXIT
  set +e
  if [[ "$status" -ne 0 && "$switched" -eq 1 ]]; then
    ln -sfn "$previous_current" "$current_link.rollback"
    mv -Tf "$current_link.rollback" "$current_link"
    ln -sfn "$previous_web" "$web_link.rollback"
    mv -Tf "$web_link.rollback" "$web_link"
    if [[ -f "$environment_backup" ]]; then
      cp "$environment_backup" "$environment_file"
      chown root:llmspace "$environment_file"
      chmod 640 "$environment_file"
    fi
    systemctl restart llm-space-web.service
    nginx -t && systemctl reload nginx
  fi
  rm -f \
    /tmp/llm-remote-mcp-check.json \
    "$archive" \
    /tmp/deploy-llm-space-guest.sh
  exit "$status"
}

trap on_exit EXIT

rollback_api() {
  ln -sfn "$previous_current" "$current_link.rollback"
  mv -Tf "$current_link.rollback" "$current_link"
  systemctl restart llm-space-web.service
}

mkdir -p "$release"
tar -xzf "$archive" -C "$release"
test -s "$release/llm-space-guest-api.mjs"
test -s "$release/web/index.html"
test "$(cat "$release/RELEASE_COMMIT")" = "$commit"
chown -R root:root "$release"
chmod -R a=rX "$release"

cp "$environment_file" "$environment_backup"
if grep -q '^GUEST_REMOTE_MCP_ENABLED=' "$environment_file"; then
  sed -i \
    's/^GUEST_REMOTE_MCP_ENABLED=.*/GUEST_REMOTE_MCP_ENABLED=0/' \
    "$environment_file"
else
  printf '\nGUEST_REMOTE_MCP_ENABLED=0\n' >> "$environment_file"
fi
chown root:llmspace "$environment_file"
chmod 640 "$environment_file"

ln -sfn "$release" "$current_link.next"
mv -Tf "$current_link.next" "$current_link"
switched=1
if ! systemctl restart llm-space-web.service; then
  rollback_api
  exit 1
fi

healthy=0
for _attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8791/health >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 0.5
done
if [[ "$healthy" -ne 1 ]]; then
  journalctl -u llm-space-web.service -n 40 --no-pager
  rollback_api
  exit 1
fi

ln -sfn "$release/web" "$web_link.next"
mv -Tf "$web_link.next" "$web_link"
nginx -t
systemctl reload nginx
web_healthy=0
for _attempt in $(seq 1 20); do
  if curl -kfsS --resolve kandian.site:443:127.0.0.1 \
    https://kandian.site/llm-space-web/ |
    grep -F "$expected_asset" >/dev/null; then
    web_healthy=1
    break
  fi
  sleep 0.5
done
if [[ "$web_healthy" -ne 1 ]]; then
  echo "WEB_LINK_BEFORE_ROLLBACK=$(readlink -f "$web_link")" >&2
  echo "EXPECTED_ASSET=$expected_asset" >&2
  curl -kfsS --resolve kandian.site:443:127.0.0.1 \
    https://kandian.site/llm-space-web/ |
    grep -o '/llm-space-web/assets/index-[A-Za-z0-9_-]*\.js' >&2 || true
  ln -sfn "$previous_web" "$web_link.rollback"
  mv -Tf "$web_link.rollback" "$web_link"
  nginx -t
  systemctl reload nginx
  exit 1
fi

curl -kfsS --resolve kandian.site:443:127.0.0.1 \
  https://kandian.site/llm-space-web/api/guest/tools |
  grep -F 'web_search' >/dev/null
curl -kfsS \
  --resolve kandian.site:443:127.0.0.1 \
  -H 'Origin: https://kandian.site' \
  -H 'Content-Type: application/json' \
  --data '{"serverId":"guest-demo-mcp"}' \
  https://kandian.site/llm-space-web/api/guest/mcp/tools |
  grep -F 'calculator' >/dev/null

curl -kfsS \
  --resolve kandian.site:443:127.0.0.1 \
  -H 'Origin: https://kandian.site' \
  -H 'Content-Type: application/json' \
  --data '{"name":"web_fetch","arguments":{"url":"https://example.com"}}' \
  https://kandian.site/llm-space-web/api/guest/tools/call |
  grep -F 'Example Domain' >/dev/null
curl -kfsS \
  --resolve kandian.site:443:127.0.0.1 \
  -H 'Origin: https://kandian.site' \
  -H 'Content-Type: application/json' \
  --data '{"name":"web_search","arguments":{"query":"LLM Space GitHub","limit":1}}' \
  https://kandian.site/llm-space-web/api/guest/tools/call |
  grep -F 'title' >/dev/null

remote_status="$(curl -sS \
  -o /tmp/llm-remote-mcp-check.json \
  -w '%{http_code}' \
  -k \
  --resolve kandian.site:443:127.0.0.1 \
  -H 'Origin: https://kandian.site' \
  -H 'Content-Type: application/json' \
  --data '{"serverId":"public-docs","url":"https://example.com/mcp"}' \
  https://kandian.site/llm-space-web/api/guest/mcp/tools)"
test "$remote_status" = "403"
grep -F 'remote_mcp_disabled' /tmp/llm-remote-mcp-check.json >/dev/null

echo "DEPLOYED_RELEASE=$release_name"
echo "PREVIOUS_RELEASE=$previous_current"
echo "ACTIVE_RELEASE=$(readlink -f "$current_link")"
systemctl is-active llm-space-web.service
