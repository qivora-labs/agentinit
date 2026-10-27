---
id: review-arch
name: Review architecture
category: workflow
version: 1.0.0
order: 60
description: Read-only architecture review.
sources:
  - https://example.com/docs/workflows
verifiedAt: 2026-10-17
---

## Purpose
Review architecture without changing files.

## Input
An optional path. Defaults to uncommitted changes.

## Steps
Read the architecture and report findings.

## Output
Findings with a file location and a suggested fix.

## Guardrails
This workflow is read-only.
