# Codex environment check

A Codex task environment can be smoke-tested without changing application code:

```bash
node --version
test -d node_modules
npm ls --depth=0
npm run build
npm test
git status --short --branch
git remote -v
```

These checks confirm the expected Node runtime, installed npm dependencies, build and test execution, and Git repository connectivity. They do not verify a production deployment.
