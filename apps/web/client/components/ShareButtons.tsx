import { useState } from "react";
import { useToast } from "../hooks/useToast";

interface Props {
  url: string;
  title: string;
}

export function ShareButtons({ url, title }: Props) {
  const [copied, setCopied] = useState(false);
  const { show } = useToast();

  const encUrl = encodeURIComponent(url);
  const encTitle = encodeURIComponent(title);

  const xHref = `https://twitter.com/intent/tweet?url=${encUrl}&text=${encTitle}`;
  const hatenaHref = `https://b.hatena.ne.jp/add?mode=confirm&url=${encUrl}&title=${encTitle}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      show("リンクをコピーしました", "success");
    } catch {
      // clipboard API 非対応環境では無視
    }
  }

  return (
    <div className="share-buttons">
      <a
        href={xHref}
        target="_blank"
        rel="noopener"
        className="share-button"
        aria-label="X (Twitter) でシェア"
      >
        {/* X (Twitter) logo */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 1200 1227"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.854V687.828Z" />
        </svg>
      </a>
      <a
        href={hatenaHref}
        target="_blank"
        rel="noopener"
        className="share-button"
        aria-label="はてなブックマークに追加"
      >
        {/* Hatena Bookmark "B!" mark */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 64 64"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <rect width="64" height="64" rx="6" fill="currentColor" fillOpacity="0" />
          <text
            x="32"
            y="48"
            textAnchor="middle"
            fontSize="44"
            fontWeight="bold"
            fontFamily="sans-serif"
            fill="currentColor"
          >
            B!
          </text>
        </svg>
      </a>
      <button
        type="button"
        className={`share-button${copied ? " share-button-copied" : ""}`}
        aria-label="URLをコピー"
        onClick={handleCopy}
      >
        {copied ? (
          /* checkmark */
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
          </svg>
        ) : (
          /* copy icon */
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" />
            <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
          </svg>
        )}
      </button>
    </div>
  );
}
