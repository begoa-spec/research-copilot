"""
Research Copilot — backend skeleton
Nebius x NVIDIA Global AI Hackathon — Best Apps and Agents track

Pipeline: plan -> research (Tavily) -> triage -> synthesize -> emit
Streams each step to the frontend as a Server-Sent Event (SSE) so the UI
can render a live reasoning trace, then the final structured report.

TODO before running:
  - pip install fastapi uvicorn openai tavily-python python-dotenv --break-system-packages
  - set env vars: NEBIUS_API_KEY, TAVILY_API_KEY, NEMOTRON_MODEL_ID
    (grab the exact Nemotron model id from the Token Factory console catalog)
"""

import json
import os
from typing import AsyncGenerator

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from openai import OpenAI
from tavily import TavilyClient

load_dotenv()  # reads variables from a .env file in the same folder

app = FastAPI(title="Research Copilot")

# Allow the React frontend (Cloudflare Pages) to call this API.
# Tighten allow_origins to your real deployed frontend URL before submitting.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

nebius = OpenAI(
    base_url="https://api.tokenfactory.nebius.com/v1/",
    api_key=os.environ["NEBIUS_API_KEY"],
)
tavily = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])
MODEL = os.environ.get("NEMOTRON_MODEL_ID", "nvidia/nemotron-4-340b-instruct")
MOCK_MODE = os.environ.get("MOCK_MODE", "false").lower() == "true"

MOCK_REPORT = {
    "market_overview": (
        "The target market shows steady demand growth, driven by rising internet "
        "penetration and a young, digitally engaged population [1]. Local "
        "spending power varies significantly by region, with urban centers "
        "showing the strongest early adoption signals [2]."
    ),
    "competitive_landscape": (
        "A handful of regional players currently dominate, with no single "
        "company holding more than a third of market share [1]. International "
        "entrants have historically struggled with localization, leaving room "
        "for a well-adapted product [3]."
    ),
    "regulatory_and_entry_barriers": (
        "Foreign entities generally face registration and local-partnership "
        "requirements before operating [2]. Data protection rules have "
        "tightened in the past two years, requiring careful compliance "
        "planning before launch [4]."
    ),
    "risks_and_recommendations": (
        "Currency volatility and payment infrastructure gaps are the most "
        "cited operational risks [3]. Recommended entry approach: partner "
        "with an established local distributor rather than a direct launch, "
        "and pilot in a single urban market before expanding nationally [4]."
    ),
}


async def run_mock_pipeline(query: str) -> AsyncGenerator[str, None]:
    """Fake pipeline for UI/demo testing without real API keys."""
    import asyncio

    steps = [
        "Planning research approach",
        "Researching: market overview",
        "Researching: competitive landscape",
        "Researching: regulatory & entry barriers",
        "Researching: risks & recommendations",
        "Reading and filtering sources",
        "Writing the report",
    ]
    for step in steps:
        yield sse("step", {"stage": "mock", "message": step})
        await asyncio.sleep(0.6)  # mimics real latency for a realistic demo feel

    yield sse("done", {"query": query, "report": MOCK_REPORT})

REPORT_SECTIONS = [
    "market_overview",
    "competitive_landscape",
    "regulatory_and_entry_barriers",
    "risks_and_recommendations",
]


class ResearchRequest(BaseModel):
    query: str


def sse(event: str, data: dict) -> str:
    """Format one Server-Sent Event frame."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


class PipelineError(Exception):
    """Raised when a pipeline step fails in a way we can't recover from."""


def call_nemotron(system_prompt: str, user_prompt: str) -> str:
    try:
        resp = nebius.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        return resp.choices[0].message.content
    except Exception as exc:
        # Covers auth errors (bad/missing NEBIUS_API_KEY), rate limits, timeouts, etc.
        raise PipelineError(f"Nemotron call failed: {exc}") from exc


def parse_plan_json(raw: str) -> dict:
    """Try to parse the planner's JSON output; tolerate common formatting issues."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        # Strip markdown code fences if the model added them despite instructions
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise PipelineError(f"Could not parse plan as JSON: {exc}") from exc


async def run_pipeline(query: str) -> AsyncGenerator[str, None]:
    # 1. PLAN — break the question into targeted search queries per section
    yield sse("step", {"stage": "planning", "message": "Planning research approach"})
    plan_prompt = (
        "You are a research planner. Given a market-entry question, output "
        "STRICT JSON ONLY — no markdown, no code fences, no commentary. "
        "The JSON must be a dict mapping each of these section keys to a list "
        f"of 1-2 targeted web search queries: {REPORT_SECTIONS}."
    )
    try:
        plan_raw = call_nemotron(system_prompt=plan_prompt, user_prompt=query)
        plan = parse_plan_json(plan_raw)
    except PipelineError:
        # One retry with an even stricter instruction before giving up
        try:
            plan_raw = call_nemotron(
                system_prompt=plan_prompt + " Respond with the JSON object and nothing else.",
                user_prompt=query,
            )
            plan = parse_plan_json(plan_raw)
        except PipelineError as exc:
            yield sse("error", {"message": str(exc)})
            return

    # 2. RESEARCH — Tavily search + extract per section
    section_sources: dict[str, list[dict]] = {}
    for section, queries in plan.items():
        yield sse("step", {"stage": "searching", "message": f"Researching: {section.replace('_', ' ')}"})
        results = []
        for q in queries:
            try:
                res = tavily.search(query=q, search_depth="advanced", max_results=5)
                results.extend(res.get("results", []))
            except Exception as exc:
                # Skip this query, keep going with whatever sources we already have
                yield sse("step", {"stage": "warning", "message": f"Search failed for '{q}', continuing"})
        section_sources[section] = results

    # 3. TRIAGE — compress raw sources into relevant, deduped snippets
    yield sse("step", {"stage": "triage", "message": "Reading and filtering sources"})
    triaged: dict[str, str] = {}
    for section, sources in section_sources.items():
        if not sources:
            triaged[section] = "No sources found for this section."
            continue
        raw_text = "\n\n".join(
            f"[{s.get('title')}]({s.get('url')})\n{s.get('content', '')}" for s in sources
        )
        try:
            triaged[section] = call_nemotron(
                system_prompt=(
                    "Extract only the facts relevant to the section topic from these "
                    "raw search snippets. Dedupe overlapping points. Keep source URLs "
                    "attached to each fact. Be concise."
                ),
                user_prompt=f"Section: {section}\n\nRaw sources:\n{raw_text}",
            )
        except PipelineError as exc:
            yield sse("error", {"message": str(exc)})
            return

    # 4. SYNTHESIZE — write the final report section by section
    yield sse("step", {"stage": "synthesizing", "message": "Writing the report"})
    report: dict[str, str] = {}
    for section, notes in triaged.items():
        try:
            report[section] = call_nemotron(
                system_prompt=(
                    "Write a clear, well-cited report section from these research "
                    "notes. Use inline citations like [1], [2] tied to the source "
                    "URLs. Keep it factual, no filler."
                ),
                user_prompt=f"Original question: {query}\n\nSection: {section}\n\nNotes:\n{notes}",
            )
        except PipelineError as exc:
            yield sse("error", {"message": str(exc)})
            return

    # 5. EMIT — send the final assembled report
    yield sse("done", {"query": query, "report": report})


@app.post("/research")
async def research(req: ResearchRequest):
    pipeline = run_mock_pipeline(req.query) if MOCK_MODE else run_pipeline(req.query)

    async def safe_pipeline():
        try:
            async for event in pipeline:
                yield event
        except Exception as exc:
            # Catch-all so an unanticipated error still reaches the frontend
            # as a readable message instead of an unexplained connection drop.
            yield sse("error", {"message": f"Unexpected error: {exc}"})

    return StreamingResponse(safe_pipeline(), media_type="text/event-stream")


@app.get("/health")
async def health():
    return {"status": "ok"}