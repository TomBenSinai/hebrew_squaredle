FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /repo/backend

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# The repo itself (wordgame.py, boards/, shapes.json, this backend) is mounted
# at /repo by docker-compose so edits reload live.
ENV PYTHONPATH=/repo RIBUON_ROOT=/repo
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "/repo/backend/app"]
