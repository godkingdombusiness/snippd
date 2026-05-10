FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .
COPY vertex_stack_reasoning.py .

CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
