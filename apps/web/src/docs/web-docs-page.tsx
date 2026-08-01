import { cn } from "@llm-space/ui/lib/utils";
import { Button } from "@llm-space/ui/ui/button";
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MenuIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { Link, Navigate, useParams } from "react-router-dom";
import remarkGfm from "remark-gfm";

import { findWebDoc, WEB_DOCS } from "./web-docs";

export function WebDocsPage() {
  const { slug } = useParams();
  const doc = findWebDoc(slug);
  const [query, setQuery] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const headings = useMemo(
    () => (doc ? _extractHeadings(doc.content) : []),
    [doc]
  );
  const filteredDocs = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return WEB_DOCS;
    return WEB_DOCS.filter((item) =>
      `${item.title} ${item.summary} ${item.content}`
        .toLocaleLowerCase()
        .includes(normalized)
    );
  }, [query]);

  useEffect(() => {
    if (!doc) return;
    document.title = `${doc.title}｜LLM Space Web 使用说明`;
    document.querySelector("main")?.scrollTo({ top: 0 });
    setMobileNavOpen(false);
  }, [doc]);

  if (!doc) return <Navigate to="/docs/quick-start" replace />;

  const currentIndex = WEB_DOCS.findIndex((item) => item.slug === doc.slug);
  const previous = WEB_DOCS[currentIndex - 1];
  const next = WEB_DOCS[currentIndex + 1];

  return (
    <div className="flex h-dvh min-w-0 flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 lg:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="打开文档目录"
          onClick={() => setMobileNavOpen(true)}
        >
          <MenuIcon />
        </Button>
        <Link to="/workbench" className="flex items-center gap-2 font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-xs text-primary-foreground">
            LS
          </span>
          <span>LLM Space Web</span>
          <span className="hidden text-xs font-normal text-muted-foreground sm:inline">
            使用说明
          </span>
        </Link>
        <div className="ml-auto">
          <Button asChild variant="outline">
            <Link to="/workbench">
              <ArrowLeftIcon />
              返回工作台
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <DocsNavigation
          className="hidden w-72 shrink-0 border-r lg:flex"
          query={query}
          onQueryChange={setQuery}
          docs={filteredDocs}
          activeSlug={doc.slug}
        />

        {mobileNavOpen ? (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <button
              aria-label="关闭文档目录"
              className="absolute inset-0 bg-black/50"
              onClick={() => setMobileNavOpen(false)}
            />
            <DocsNavigation
              className="relative z-10 w-[min(86vw,20rem)] border-r bg-background shadow-xl"
              query={query}
              onQueryChange={setQuery}
              docs={filteredDocs}
              activeSlug={doc.slug}
              closeButton={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="关闭文档目录"
                  onClick={() => setMobileNavOpen(false)}
                >
                  <XIcon />
                </Button>
              }
            />
          </div>
        ) : null}

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 py-10 md:px-8 xl:grid-cols-[minmax(0,1fr)_13rem]">
            <article className="min-w-0 max-w-3xl">
              <div className="mb-8 border-b pb-6">
                <div className="text-xs font-medium text-primary">{doc.group}</div>
                <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
                  {doc.title}
                </h1>
                <p className="mt-3 text-base text-muted-foreground">
                  {doc.summary}
                </p>
              </div>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={DOC_COMPONENTS}
              >
                {doc.content}
              </ReactMarkdown>

              <nav className="mt-12 grid gap-3 border-t pt-6 sm:grid-cols-2">
                {previous ? (
                  <Link
                    to={`/docs/${previous.slug}`}
                    className="rounded-lg border p-4 transition-colors hover:bg-muted"
                  >
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <ChevronLeftIcon className="size-3" />上一篇
                    </span>
                    <span className="mt-1 block font-medium">{previous.title}</span>
                  </Link>
                ) : (
                  <div />
                )}
                {next ? (
                  <Link
                    to={`/docs/${next.slug}`}
                    className="rounded-lg border p-4 text-right transition-colors hover:bg-muted"
                  >
                    <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                      下一篇<ChevronRightIcon className="size-3" />
                    </span>
                    <span className="mt-1 block font-medium">{next.title}</span>
                  </Link>
                ) : null}
              </nav>
            </article>

            <aside className="sticky top-0 hidden h-fit border-l pl-5 xl:block">
              <div className="mb-3 text-xs font-semibold">本页内容</div>
              <nav className="space-y-2">
                {headings.map((heading) => (
                  <button
                    key={heading.id}
                    className="block w-full text-left text-xs text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      document.getElementById(heading.id)?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      })
                    }
                  >
                    {heading.text}
                  </button>
                ))}
              </nav>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

function DocsNavigation({
  className,
  query,
  onQueryChange,
  docs,
  activeSlug,
  closeButton,
}: {
  className?: string;
  query: string;
  onQueryChange: (query: string) => void;
  docs: typeof WEB_DOCS;
  activeSlug: string;
  closeButton?: ReactNode;
}) {
  const groups = [...new Set(docs.map((doc) => doc.group))];
  return (
    <aside className={cn("min-h-0 flex-col", className)}>
      <div className="flex items-center gap-2 border-b p-4">
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border bg-background px-3 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
          <SearchIcon className="size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索使用说明"
            aria-label="搜索使用说明"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        {closeButton}
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto p-4">
        {groups.length ? (
          groups.map((group) => (
            <div key={group} className="mb-6">
              <div className="mb-2 px-2 text-xs font-semibold text-muted-foreground">
                {group}
              </div>
              <div className="space-y-1">
                {docs
                  .filter((doc) => doc.group === group)
                  .map((doc) => (
                    <Link
                      key={doc.slug}
                      to={`/docs/${doc.slug}`}
                      className={cn(
                        "block rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted",
                        activeSlug === doc.slug &&
                          "bg-primary/10 font-medium text-primary"
                      )}
                    >
                      {doc.title}
                    </Link>
                  ))}
              </div>
            </div>
          ))
        ) : (
          <p className="px-2 text-sm text-muted-foreground">没有匹配的说明。</p>
        )}
      </nav>
    </aside>
  );
}

function _headingText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }
      if (isValidElement<{ children?: ReactNode }>(child)) {
        return _headingText(child.props.children);
      }
      return "";
    })
    .join("");
}

function _headingId(text: string): string {
  return `section-${text
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-|-$/g, "")}`;
}

function _extractHeadings(markdown: string) {
  return markdown
    .split("\n")
    .filter((line) => /^##\s+/.test(line))
    .map((line) => {
      const text = line.replace(/^##\s+/, "").trim();
      return { text, id: _headingId(text) };
    });
}

const DOC_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h2
      id={_headingId(_headingText(children))}
      className="mt-10 scroll-mt-6 border-b pb-3 text-2xl font-bold tracking-tight"
    >
      {children}
    </h2>
  ),
  h2: ({ children }) => (
    <h2
      id={_headingId(_headingText(children))}
      className="mt-10 scroll-mt-6 border-b pb-3 text-2xl font-bold tracking-tight"
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-8 scroll-mt-6 text-lg font-semibold">{children}</h3>
  ),
  p: ({ children }) => <p className="my-4 text-[0.9375rem]/7">{children}</p>,
  ul: ({ children }) => <ul className="my-4 list-disc space-y-1 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="my-4 list-decimal space-y-1 pl-6">{children}</ol>,
  blockquote: ({ children }) => (
    <blockquote className="my-5 border-l-4 border-primary/40 bg-muted/50 px-4 py-1 text-muted-foreground">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) =>
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.875em]">
        {children}
      </code>
    ),
  pre: ({ children }) => (
    <pre className="my-5 overflow-x-auto rounded-lg border bg-muted p-4 text-sm leading-6">
      {children}
    </pre>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
      className="font-medium text-primary underline underline-offset-4"
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="my-5 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border bg-muted px-3 py-2 text-left">{children}</th>,
  td: ({ children }) => <td className="border px-3 py-2 align-top">{children}</td>,
};
