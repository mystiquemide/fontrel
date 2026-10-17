FROM python:3.13-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend backend
WORKDIR /app/backend
EXPOSE 8000
CMD ["uvicorn", "fontrel.api:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
