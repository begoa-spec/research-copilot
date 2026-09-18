import { useState, useRef } from "react";

// Point this at your running backend. Deployed on Render.
const API_URL = "https://research-copilot-backend-vqq5.onrender.com/research";

const SECTION_LABELS = {
  market_overview: "Market overview",
  competitive_landscape: "Competitive landscape",
  regulatory_and_entry_barriers: "Regulatory & entry barriers",
  risks_and_recommendations: "Risks & recommendations",
};

// Inline icons — no new dependency required
const IconSend = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const IconDownload = (props) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" />
  </svg>
);
const IconAlert = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 9v4m0 4h.01M10.29 3.86l-8.18 14.18A2 2 0 004 21h16a2 2 0 001.89-2.96L13.71 3.86a2 2 0 00-3.42 0z" />
  </svg>
);
const IconCheck = (props) => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M5 13l4 4L19 7" />
  </svg>
);
const IconGlobe = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
  </svg>
);
const IconSearch = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

const PHASES = [
  { stage: "planning", label: "Plan", desc: "Breaking the question into research queries" },
  { stage: "searching", label: "Research", desc: "Searching live web sources" },
  { stage: "triage", label: "Triage", desc: "Filtering and deduping sources" },
  { stage: "synthesizing", label: "Synthesize", desc: "Writing the cited report" },
];

export default function ResearchCopilot() {
  const [query, setQuery] = useState("");
  const [trace, setTrace] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  async function runResearch(e) {
    e.preventDefault();
    if (!query.trim()) return;

    setTrace([]);
    setReport(null);
    setError(null);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Server responded with ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line: "event: X\ndata: Y\n\n"
        const frames = buffer.split("\n\n");
        buffer = frames.pop(); // keep any incomplete trailing frame in the buffer

        for (const frame of frames) {
          const eventLine = frame.split("\n").find((l) => l.startsWith("event:"));
          const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!eventLine || !dataLine) continue;

          const eventType = eventLine.replace("event:", "").trim();
          const data = JSON.parse(dataLine.replace("data:", "").trim());

          if (eventType === "step") {
            setTrace((prev) => [...prev, { stage: data.stage, message: data.message }]);
          } else if (eventType === "error") {
            setError(data.message);
          } else if (eventType === "done") {
            setReport(data.report);
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err.message || "Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  }

  function downloadPdf() {
    const prevTitle = document.title;
    document.title = "Market Entry Report"; // becomes the suggested PDF filename
    window.print();
    document.title = prevTitle;
  }

  return (
    <div className="min-h-screen bg-[#F5F6FA]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { font-family: 'Inter', system-ui, sans-serif; }

        @media print {
          body * { visibility: hidden; }
          #printable-report, #printable-report * { visibility: visible; }
          #printable-report {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            background: #ffffff !important;
          }
          @page { margin: 1.5cm; }
        }
      `}</style>

      {/* Top bar */}
      <div className="bg-[#16213E] text-white print:hidden">
        <div className="max-w-2xl mx-auto px-6 py-3.5 flex items-center gap-2.5">
          <IconGlobe className="text-[#E8792F]" />
          <span className="font-semibold tracking-tight">Research Copilot</span>
          <span className="text-[10px] font-semibold bg-white/10 text-[#E8792F] px-2 py-0.5 rounded-full">
            Market entry
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-extrabold text-[#16213E] mb-1.5 print:hidden">
          Market-entry research, sourced and structured
        </h1>
        <p className="text-sm text-[#5B6478] mb-7 print:hidden">
          Ask a question, watch the agent research it live, and get a cited report.
        </p>

        {/* Query card */}
        <div className="bg-white border border-[#E4E7ED] rounded-xl shadow-sm p-5 print:hidden">
          <form onSubmit={runResearch} className="space-y-3">
            <label className="block text-sm font-medium text-[#16213E]">
              What market-entry question do you want researched?
            </label>
            <div className="relative">
              <IconSearch className="absolute left-3.5 top-3.5 text-[#9AA2B1]" />
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                rows={3}
                placeholder="e.g. What should a US fintech founder know before entering the Kenyan mobile payments market?"
                className="w-full bg-[#FAFAFC] border border-[#E4E7ED] rounded-lg p-3.5 pl-10 text-sm text-[#16213E] placeholder-[#9AA2B1] focus:outline-none focus:border-[#16213E] transition-colors duration-200 resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#16213E] text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#1E2C52] transition-all duration-200"
            >
              {loading ? "Researching…" : "Run research"}
              {!loading && <IconSend />}
            </button>
          </form>
        </div>

        {/* Error — styled like an alert banner */}
        {error && (
          <div className="mt-5 flex items-start gap-2.5 text-sm text-[#8A3B0D] bg-[#FDEEE2] border border-[#F3C9A3] rounded-xl p-3.5 print:hidden">
            <IconAlert className="mt-0.5 shrink-0 text-[#E8792F]" />
            <span>{error}</span>
          </div>
        )}

        {/* Reasoning trace — phase stepper */}
        {trace.length > 0 && (
          <div className="mt-7 bg-white border border-[#E4E7ED] rounded-xl p-5 print:hidden">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-[#5B6478]">Research progress</h3>
              <span className="text-xs text-[#9AA2B1]">
                Step {Math.min(
                  report ? 4 : Math.max(1, PHASES.findIndex((p) => p.stage === trace[trace.length - 1]?.stage) + 1),
                  4
                )} of 4
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {PHASES.map((phase, i) => {
                const reachedIndex = PHASES.findIndex((p) => p.stage === trace[trace.length - 1]?.stage);
                const isDone = report || i < reachedIndex;
                const isActive = !report && i === reachedIndex;
                const latestForPhase = [...trace].reverse().find((t) => t.stage === phase.stage);

                return (
                  <div
                    key={phase.stage}
                    className={`border rounded-lg p-3 ${
                      isDone || isActive ? "border-[#E4E7ED]" : "border-[#EEF0F3]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          isDone
                            ? "bg-[#16213E] text-white"
                            : isActive
                            ? "bg-[#E8792F] text-white"
                            : "bg-[#EEF0F3] text-[#9AA2B1]"
                        }`}
                      >
                        {isDone ? <IconCheck /> : <span className="text-[10px] font-bold">{i + 1}</span>}
                      </span>
                      {(isDone || isActive) && (
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            isDone ? "bg-[#EDF7ED] text-[#2E7D32]" : "bg-[#FDEEE2] text-[#E8792F]"
                          }`}
                        >
                          {isDone ? "Done" : "Running"}
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-bold text-[#16213E]">{phase.label}</div>
                    <div className="text-xs text-[#9AA2B1] mt-0.5 leading-snug">
                      {latestForPhase ? latestForPhase.message : phase.desc}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Report */}
        {report && (
          <div className="mt-7">
            <div className="flex items-center justify-between mb-4 print:hidden">
              <h2 className="text-lg font-bold text-[#16213E]">Report</h2>
              <button
                onClick={downloadPdf}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#E8792F] text-white text-sm font-semibold hover:bg-[#D6691F] transition-all duration-200"
              >
                <IconDownload />
                Download PDF
              </button>
            </div>

            <div id="printable-report" className="bg-white border border-[#E4E7ED] rounded-xl p-6 space-y-6">
              <div className="hidden print:block mb-2">
                <h2 className="text-xl font-extrabold text-[#16213E]">Market Entry Research Report</h2>
                <p className="text-xs text-[#5B6478] mt-1">Query: {query}</p>
              </div>
              {Object.entries(report).map(([key, text]) => (
                <div key={key}>
                  <h3 className="text-sm font-bold text-[#16213E] mb-1.5 pb-1.5 border-b border-[#E4E7ED]">
                    {SECTION_LABELS[key] || key}
                  </h3>
                  <p className="text-sm leading-relaxed text-[#3C4457] whitespace-pre-line">
                    {text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}