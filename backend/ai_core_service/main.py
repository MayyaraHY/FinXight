from fastapi import FastAPI, HTTPException, Body

from infrastructure.document_management.pipeline import NC01Pipeline


app = FastAPI(title="Tunisian Finance AI - NC01")
pipe = NC01Pipeline()


@app.get("/")
async def root():
	return {"message": "NC_01 Semantic Engine is Online"}


@app.post("/initialize")
async def initialize():
	try:
		stats = pipe.ingest_nc01()
		return {"status": "success", "details": stats}
	except Exception as e:
		raise HTTPException(status_code=500, detail=f"Init failed: {str(e)}")


@app.post("/ask-nc01")
async def ask_question(payload: dict = Body(...)):
	question = (payload.get("question") or "").strip()
	if not question:
		raise HTTPException(status_code=400, detail="Missing 'question' in body.")

	try:
		results = pipe.ask_nc01(question)
		return {
			"question": question,
			"answers": [
				{
					"text": r.get("text", ""),
					"page": r.get("page_number") or r.get("page_num"),
					"score": r.get("distance") or r.get("score"),
				}
				for r in results
			],
		}
	except RuntimeError as re:
		raise HTTPException(status_code=400, detail=str(re))
	except Exception as e:
		raise HTTPException(status_code=500, detail=f"Query error: {str(e)}")


@app.post("/explain-line")
async def explain_line(payload: dict = Body(...)):
	line_number = str(payload.get("line_number", "")).strip()
	if not line_number:
		raise HTTPException(status_code=400, detail="Missing 'line_number' in body.")

	try:
		return pipe.get_smart_explanation(line_number)
	except RuntimeError as re:
		raise HTTPException(status_code=400, detail=str(re))
	except Exception as e:
		raise HTTPException(status_code=500, detail=f"Explain error: {str(e)}")


if __name__ == "__main__":
	import uvicorn

	uvicorn.run(app, host="127.0.0.1", port=8000)
