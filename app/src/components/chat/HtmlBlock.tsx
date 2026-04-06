import { Code, Eye } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrintMode } from "../../context/PrintContext";
import CodeBlock from "./CodeBlock";
import styles from "./HtmlBlock.module.css";

interface HtmlBlockProps {
  code: string;
}

const RESIZE_SCRIPT = `<script>
(function(){
  function send(){
    var h = document.documentElement.scrollHeight;
    parent.postMessage({type:"html-block-resize",height:h},"*");
  }
  send();
  new MutationObserver(send).observe(document.body,{childList:true,subtree:true,attributes:true});
  window.addEventListener("load",send);
  window.addEventListener("resize",send);
})();
</script>`;

const FULL_DOC_RE = /<!doctype\s+html[\s>]|<html[\s>]/i;
const SCRIPT_RE = /<script[\s>][\s\S]*?<\/script\s*>/gi;
const EVENT_RE = /\s+on\w+\s*=\s*"[^"]*"/gi;
const BODY_RE = /<body[^>]*>([\s\S]*)<\/body\s*>/i;
const STYLE_RE = /<style[^>]*>([\s\S]*?)<\/style\s*>/gi;

function stripScripts(html: string): string {
  return html.replace(SCRIPT_RE, "").replace(EVENT_RE, "");
}

function wrapSnippet(snippet: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>body{font-family:system-ui,-apple-system,sans-serif;margin:8px;}</style></head>
<body>${snippet}</body></html>`;
}

function extractPrintHtml(html: string): string {
  const safe = stripScripts(html);

  const styleBlocks: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(STYLE_RE.source, STYLE_RE.flags);
  while ((match = re.exec(safe)) !== null) {
    styleBlocks.push(match[1]);
  }

  const bodyMatch = BODY_RE.exec(safe);
  const body = bodyMatch ? bodyMatch[1] : safe;

  if (styleBlocks.length > 0) {
    return `<style>${styleBlocks.join("\n")}</style>${body}`;
  }
  return body;
}

const HtmlBlock = memo(function HtmlBlock({ code }: HtmlBlockProps) {
  const printMode = usePrintMode();
  const [showSource, setShowSource] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(300);

  const srcDoc = useMemo(() => {
    const safe = stripScripts(code);
    const doc = FULL_DOC_RE.test(safe) ? safe : wrapSnippet(safe);
    if (doc.includes("</body>")) {
      return doc.replace("</body>", RESIZE_SCRIPT + "</body>");
    }
    return doc + RESIZE_SCRIPT;
  }, [code]);

  const printHtml = useMemo(() => {
    if (!printMode) return "";
    return extractPrintHtml(code);
  }, [code, printMode]);

  const handleMessage = useCallback((e: MessageEvent) => {
    if (e.source !== iframeRef.current?.contentWindow) return;
    if (e.data?.type === "html-block-resize" && typeof e.data.height === "number") {
      setHeight(Math.min(Math.max(e.data.height, 100), 2000));
    }
  }, []);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  if (printMode) {
    return (
      <div className={styles.printWrap} dangerouslySetInnerHTML={{ __html: printHtml }} />
    );
  }

  if (showSource) {
    return (
      <div className={styles.wrap}>
        <div className={styles.header}>
          <span className={styles.label}>html</span>
          <button className={styles.toggleBtn} onClick={() => setShowSource(false)} title="Preview HTML">
            <Eye size={13} strokeWidth={1.5} />
            <span>Preview</span>
          </button>
        </div>
        <CodeBlock code={code} language="html" />
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.label}>html preview</span>
        <button className={styles.toggleBtn} onClick={() => setShowSource(true)} title="View source">
          <Code size={13} strokeWidth={1.5} />
          <span>Source</span>
        </button>
      </div>
      <iframe
        ref={iframeRef}
        className={styles.iframe}
        srcDoc={srcDoc}
        sandbox="allow-scripts"
        style={{ height }}
        title="HTML Preview"
      />
    </div>
  );
});

export default HtmlBlock;
