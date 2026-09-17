# Research Copilot

An agentic research tool that turns a market-entry question into a structured,
sourced report — built for the **Nebius x NVIDIA Global AI Hackathon**
(Best Apps and Agents track).

Instead of a chatbot answer, it plans a research approach, searches the live
web, triages sources, and synthesizes a report broken into clear sections:
Market Overview, Competitive Landscape, Regulatory & Entry Barriers, and
Risks & Recommendations — each streamed live so you can watch the agent
reason through the problem before the final report appears.

## Stack

- **Backend:** FastAPI, streaming responses via Server-Sent Events (SSE)
- **Reasoning:** NVIDIA Nemotron, served through Nebius Token Factory
- **Web research:** Tavily API
- **Frontend:** React + Vite + Tailwind CSS
- **Storage:** Supabase

## How it works

1. **Plan** — Nemotron breaks the question into targeted search queries per report section
2. **Research** — Tavily searches the live web for each query
3. **Triage** — Nemotron compresses and dedupes the raw sources into relevant notes
4. **Synthesize** — Nemotron writes the final, cited report section by section
5. **Report** — rendered in the browser, with a "Download PDF" option

## Running locally

### Backend

```bash
cd research-copilot
python -m venv venv
.\venv\Scripts\Activate.ps1        # Windows PowerShell
pip install -r requirements.txt
```

Create a `.env` file in this folder with:

```
NEBIUS_API_KEY=your_key_here
TAVILY_API_KEY=your_key_here
NEMOTRON_MODEL_ID=your_model_id_here
```

Then run:

```bash
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd research-copilot-frontend
npm install
npm run dev
```

The frontend expects the backend running at `http://127.0.0.1:8000`.

## Hackathon submission notes

Built solo for the Nebius x NVIDIA Global AI Hackathon. Uses Nebius Token
Factory as the required inference layer and NVIDIA's open Nemotron model
family for all reasoning steps, with Tavily providing live, grounded web
research.

## License

MIT — see [LICENSE](./LICENSE).
