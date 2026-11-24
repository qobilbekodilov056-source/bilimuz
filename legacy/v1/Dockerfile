FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /usr/src/testlab
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY static ./static
RUN mkdir -p data && useradd -r -m -u 10001 sysone && chown -R sysone:sysone /usr/src/testlab
USER sysone
EXPOSE 8080
CMD ["python","-m","uvicorn","app.main:app","--host","0.0.0.0","--port","8080","--proxy-headers"]
