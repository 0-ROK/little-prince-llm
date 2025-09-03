# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a RAG (Retrieval-Augmented Generation) system for "Le Petit Prince" (The Little Prince) by Antoine de Saint-Exupéry. It provides literary analysis and commentary on the French text using vector search and LLM generation.

## Architecture

- **Server**: Express.js server (`server/server.ts`) handling API endpoints
- **LLM**: AWS Bedrock with Claude 3 Sonnet for text generation
- **Embeddings**: OpenAI's text-embedding-ada-002 model
- **Vector Database**: Pinecone for storing and retrieving text chunks
- **PDF Processing**: Extracts text from the French PDF of Le Petit Prince

## Key Components

- `server/server.ts`: Main server with three endpoints:
  - `/generate`: Retrieves relevant text chunks and generates literary analysis
  - `/embedding`: Creates embeddings for all text chunks and stores in Pinecone
  - `/how-many-vectors`: Returns the total number of text chunks
- `server/utils/chunkText.ts`: Splits text into fixed-size chunks (350 characters)

## Commands

```bash
# Navigate to server directory
cd server

# Install dependencies
yarn install

# Start the server
yarn start
```

## Environment Variables

Required in `server/.env`:
- `AWS_ACCESS_KEY_ID`: AWS credentials for Bedrock
- `AWS_SECRET_ACCESS_KEY`: AWS credentials for Bedrock
- `AWS_REGION`: AWS region for Bedrock
- `OPENAI_API_KEY`: OpenAI API key for embeddings
- `PINECONE_API_KEY`: Pinecone API key for vector database

## Development Workflow

1. The system reads the PDF file `server/docs/st_exupery_le_petit_prince.pdf` on startup
2. Text is chunked into 350-character segments
3. Use `/embedding` endpoint to create and store embeddings in Pinecone (namespace: "france", index: "little-prince")
4. Use `/generate` endpoint to query with user messages - it retrieves top 2 relevant chunks and generates Korean literary analysis