# DevOps Guide - WorldMonitor / Startup Intelligence

This project follows a modern DevOps workflow using GitHub Actions for CI/CD and a standard branching strategy.

## Branching Strategy

- **`main`**: Production environment. Only stable, tested code should reside here.
- **`develop`**: Staging/Integration environment. All feature branches are merged here first.
- **`feature/*`**: Individual features or bug fixes. Branches should be created from `develop` and merged back via Pull Request.

## Workflow

1.  **Develop**: Create a branch from `develop` (e.g., `feature/new-dashboard`).
2.  **Commit**: Push changes and open a Pull Request (PR) to `develop`.
3.  **CI**: GitHub Actions will automatically run:
    - Linting
    - Typechecking (SPA & API)
    - Unit & Integration Tests
    - Sidecar Tests
4.  **Review & Merge**: Once the CI passes and the code is reviewed, merge the PR into `develop`.
5.  **Staging Deployment**: Merging into `develop` automatically triggers a deployment to the **Staging** environment on Vercel.
6.  **Production Release**: When `develop` is stable and ready for release, create a PR from `develop` to `main`.
7.  **Production Deployment**: Merging into `main` automatically triggers a deployment to the **Production** environment on Vercel.

## Setup Instructions

### 1. GitHub Secrets
To enable automated deployments, you must add the following secrets to your GitHub repository (`Settings > Secrets and variables > Actions`):

- `VERCEL_TOKEN`: Your Vercel Personal Access Token.
- `VERCEL_ORG_ID`: Your Vercel Organization ID (found in `.vercel/project.json`).
- `VERCEL_PROJECT_ID`: Your Vercel Project ID (found in `.vercel/project.json`).

### 2. Branch Protection Rules
It is highly recommended to protect `main` and `develop` branches:
- Go to `Settings > Branches > Add branch protection rule`.
- Pattern: `main` (and another for `develop`).
- Check: `Require a pull request before merging`.
- Check: `Require status checks to pass before merging` (select the "CI" job).

## Deployment Targets

- **Frontend/API**: Vercel (Edge Functions).
- **Backend/Relay**: Railway (requires manual setup or adding Railway CLI to workflows).
- **Desktop**: GitHub Actions generates release artifacts (if configured).

---

*This document was generated to ensure consistent delivery and high quality standards.*
