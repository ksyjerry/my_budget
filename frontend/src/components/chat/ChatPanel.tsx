"use client";

import { useState, useRef, useEffect } from "react";


const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface Message {
  role: "user" | "assistant";
  content: string;
  skills?: string[];
  elapsed?: number;
}

function MarkdownRenderer({ text }: { text: string }) {
  // Simple markdown: **bold**, tables, line breaks
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let tableRows: string[][] = [];
  let inTable = false;

  const processInline = (line: string) => {
    // Bold
    return line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Table detection
    if (line.includes("|") && line.trim().startsWith("|")) {
      const cells = line.split("|").filter((c) => c.trim() !== "").map((c) => c.trim());
      // Skip separator row (---)
      if (cells.every((c) => /^[-:]+$/.test(c))) continue;
      tableRows.push(cells);
      inTable = true;
      continue;
    }

    // Flush table
    if (inTable && tableRows.length > 0) {
      elements.push(
        <div key={`tbl-${i}`} className="overflow-x-auto my-2">
          <table className="text-xs border border-pwc-gray-200 w-full">
            <thead>
              <tr className="bg-pwc-gray-50">
                {tableRows[0].map((h, hi) => (
                  <th key={hi} className="px-2 py-1 border-b border-pwc-gray-200 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.slice(1).map((row, ri) => (
                <tr key={ri} className="border-b border-pwc-gray-100">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-2 py-1">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
      inTable = false;
    }

    if (line.trim() === "") {
      elements.push(<br key={`br-${i}`} />);
    } else {
      elements.push(
        <p
          key={`p-${i}`}
          className="mb-1"
          dangerouslySetInnerHTML={{ __html: processInline(line) }}
        />
      );
    }
  }

  // Flush remaining table
  if (tableRows.length > 0) {
    elements.push(
      <div key="tbl-end" className="overflow-x-auto my-2">
        <table className="text-xs border border-pwc-gray-200 w-full">
          <thead>
            <tr className="bg-pwc-gray-50">
              {tableRows[0].map((h, hi) => (
                <th key={hi} className="px-2 py-1 border-b border-pwc-gray-200 text-left font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.slice(1).map((row, ri) => (
              <tr key={ri} className="border-b border-pwc-gray-100">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-2 py-1">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return <div>{elements}</div>;
}

export default function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "안녕하세요! My Budget+ AI 어시스턴트입니다.\n프로젝트 현황, budget 잔여, 초과 분석 등을 질문해주세요." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/v1/chat`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: msg }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Error ${res.status}`);
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          skills: data.skills_used,
          elapsed: data.elapsed_ms,
        },
      ]);
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : "오류가 발생했습니다.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `오류: ${errorMsg}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed bottom-4 right-4 w-[420px] h-[600px] bg-white rounded-xl shadow-2xl border border-pwc-gray-200 flex flex-col z-[100] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-pwc-orange to-[#EB8C00] text-white shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
          <span className="text-sm font-bold">My Budget+ AI</span>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
                msg.role === "user"
                  ? "bg-pwc-orange text-white"
                  : "bg-pwc-gray-50 text-pwc-gray-900 border border-pwc-gray-100"
              }`}
            >
              {msg.role === "assistant" ? (
                <MarkdownRenderer text={msg.content} />
              ) : (
                msg.content
              )}
              {msg.elapsed && (
                <p className="text-[10px] text-pwc-gray-600 mt-1 text-right">
                  {(msg.elapsed / 1000).toFixed(1)}s
                </p>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-pwc-gray-50 border border-pwc-gray-100 rounded-lg px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-pwc-orange rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-pwc-orange rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-pwc-orange rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-2.5 border-t border-pwc-gray-100 bg-white shrink-0">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && handleSend()}
            placeholder="질문을 입력하세요..."
            className="flex-1 px-3 py-2 text-sm border border-pwc-gray-200 rounded-lg focus:outline-none focus:border-pwc-orange bg-white text-pwc-gray-900"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-3 py-2 bg-pwc-orange text-white rounded-lg hover:bg-[#B8400A] disabled:opacity-40 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
