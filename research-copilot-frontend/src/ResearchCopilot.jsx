import { useState, useRef } from "react";

// Point this at your running backend. Deployed on Render.
const API_URL = "https://research-copilot-backend-vqq5.onrender.com/research";

const SECTION_LABELS = {
  market_overview: "Market overview",
  competitive_landscape: "Competitive landscape",
  regulatory_and_entry_barriers: "Regulatory & entry barriers",
  risks_and_recommendations: "Risks & recommendations",
};

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
            setTrace((prev) => [...prev, data.message]);
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
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Print-only styles: hides everything except #printable-report when printing */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-report, #printable-report * { visibility: visible; }
          #printable-report {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
          }
          @page { margin: 1.5cm; }
        }
      `}</style>

      <form onSubmit={runResearch} className="space-y-3 print:hidden">
        <label className="block text-sm font-medium text-gray-700">
          What market-entry question do you want researched?
        </label>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={3}
          placeholder="e.g. What should a US fintech founder know before entering the Kenyan mobile payments market?"
          className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Researching..." : "Run research"}
        </button>
      </form>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      {trace.length > 0 && (
        <div className="space-y-1 print:hidden">
          <h3 className="text-sm font-medium text-gray-500">Reasoning trace</h3>
          <ul className="space-y-1">
            {trace.map((step, i) => (
              <li key={i} className="text-sm text-gray-600 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                {step}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report && (
        <div className="space-y-4 border-t pt-4">
          <div className="flex items-center justify-between print:hidden">
            <h2 className="text-lg font-semibold">Report</h2>
            <button
              onClick={downloadPdf}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50"
            >
              Download PDF
            </button>
          </div>
          <div id="printable-report" className="space-y-4">
            <h2 className="text-lg font-semibold hidden print:block mb-2">
              Market Entry Research Report
            </h2>
            <p className="text-xs text-gray-500 hidden print:block mb-4">
              Query: {query}
            </p>
            {Object.entries(report).map(([key, text]) => (
              <div key={key}>
                <h3 className="text-sm font-semibold text-gray-800 mb-1">
                  {SECTION_LABELS[key] || key}
                </h3>
                <p className="text-sm text-gray-700 whitespace-pre-line">{text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}