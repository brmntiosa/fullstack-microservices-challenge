FROM golang:1.22-alpine AS build
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o server ./cmd/server

FROM alpine:3.20
WORKDIR /app
COPY --from=build /app/server .
EXPOSE 4000
CMD ["./server"]
