# Ghost Machine (RepoPilot) — AI-Powered GitHub Repository Intelligence

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 4: Ghost in the Machine](https://dev.to/challenges/hacktoberfest-week4-2026-10-26).*

## What I Built

I built **Ghost Machine (RepoPilot)**, an AI-powered GitHub repository assessment and management platform.

Managing multiple GitHub repositories can become difficult. It is easy to overlook failed workflows, unresolved issues, inactive projects and maintenance problems.

RepoPilot helps developers understand the health of their repositories without manually checking every detail.

Key features include:

- **GitHub Integration:** Connect your GitHub account and import repositories.
- **Repository Assessment:** Evaluate repository health using available GitHub activity and workflow information.
- **AI-Powered Summaries:** Generate understandable project overviews, identify risks and receive recommended next steps.
- **Project Management:** Organize repositories by status, including In Progress, Needs Attention, Completed and On Hold.
- **Actionable Insights:** Highlight failed workflows, maintenance concerns and other important signals.

I interpreted the Ghost in the Machine theme as giving developers an intelligent assistant that works behind the scenes, examining repository activity and bringing hidden problems to their attention.

## Demo

**Live Application:** [https://repopilot-9tal.onrender.com](https://repopilot-9tal.onrender.com)

## Code

**GitHub Repository:** [https://github.com/RISHABH12005/Ghost-Machine](https://github.com/RISHABH12005/Ghost-Machine)

The project is open source. You can explore the implementation, inspect the API routes and contribute improvements.

## How I Built It

I built RepoPilot using a modern web application stack:

- **Next.js and React** for the application and user interface.
- **TypeScript** for type-safe development.
- **Tailwind CSS** for responsive styling.
- **GitHub API and GraphQL API** for repository information, contributions, issues, pull requests and workflow activity.
- **Ollama Cloud** for AI-powered repository analysis.
- **Gemma 4 (31B)** as the model used for generating repository summaries in the demonstrated configuration.

The application collects relevant GitHub metadata and sends it to the Ollama Cloud model for analysis. The model generates project overviews, identifies potential risks and recommends actions.

An important design decision is that repository summaries use GitHub metadata rather than sending entire source-code repositories to the model.

This makes the analysis focused on repository activity, maintenance and project health.

## Why Does Open Innovation Matter?

Open innovation makes it possible for developers to experiment with open-weight AI models and build useful applications without depending entirely on closed AI APIs.

Using Ollama gave me flexibility in selecting and changing models while keeping the AI integration separate from the main application.

It also makes the architecture adaptable to different inference environments, including local model deployments and other compatible model providers.

Most importantly, open-source tools allowed me to build, modify and share a practical AI-powered developer tool while keeping the project accessible to other contributors.

## The Spirit of It

A repository can look perfectly fine at first glance while hiding failed workflows, maintenance problems and important unfinished work.

I wanted to build something that could look beyond the repository's name and description, examine its activity and reveal what actually needs attention.

**RepoPilot gives those hidden signals a voice.**
