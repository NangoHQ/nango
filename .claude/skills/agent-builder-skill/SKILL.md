---
name: agent-builder
description: Use when creating, improving, or troubleshooting Claude Code subagents. Expert guidance on agent design, system prompts, tool access, model selection, and best practices for building specialized AI assistants.
tags: meta
globs:
  - "**/.claude/agents/**/*.md"
  - "**/.claude/agents/**/*.markdown"
alwaysApply: false
---

# Agent Builder - Claude Code Subagent Expert

Use this skill when creating, improving, or troubleshooting Claude Code subagents. Provides expert guidance on agent design, system prompt engineering, tool configuration, and delegation patterns.

## When to Use This Skill

Activate this skill when:
- User asks to create a new subagent
- User wants to improve an existing agent
- User needs help with agent configuration or tool access
- User is troubleshooting agent invocation issues
- User wants to understand when to use agents vs skills vs commands
- User asks about agent chaining or delegation patterns

## Quick Reference

### Agent File Structure

```markdown
---
name: agent-name
description: When and why to use this agent
tools: Read, Write, Bash(git *)
model: sonnet
---

Your detailed system prompt defining:
- Agent role and expertise
- Problem-solving approach
- Output format expectations
- Specific constraints or requirements
```

### File Locations

**Project agents** (shared with team, highest priority):
```
.claude/agents/my-agent.md
```

**Personal agents** (individual use, lower priority):
```
~/.claude/agents/my-agent.md
```

**Plugin agents** (from installed plugins):
```
<plugin-dir>/agents/agent-name.md
```

## Creating Effective Subagents

### Step 1: Identify the Use Case

**Good candidates for subagents:**
- Complex, multi-step workflows
- Specialized expertise (debugging, security review, data analysis)
- Tasks requiring focused context
- Repeatable processes with specific quality bars
- Code review and analysis workflows

**NOT good for subagents (use Skills/Commands instead):**
- Simple one-off prompts (use Slash Commands)
- Context-aware automatic activation (use Skills)
- Quick transformations or formatting

### Step 2: Design Agent Scope

**Best practices:**
- **Single responsibility** - Each agent does ONE thing exceptionally well
- **Clear boundaries** - Define what's in/out of scope
- **Specific expertise** - Don't create "general helper" agents
- **Measurable outcomes** - Agent should produce concrete deliverables

**Examples:**
- ✅ **code-reviewer** - Reviews code changes for quality, security, and best practices
- ✅ **debugger** - Root cause analysis and minimal fixes for errors
- ✅ **data-scientist** - SQL query optimization and data analysis
- ❌ **helper** - Too vague, no clear scope
- ❌ **everything** - Defeats purpose of specialization

### Step 3: Write the System Prompt

The system prompt is the most critical part of your agent. It defines the agent's personality, capabilities, and approach.

**Structure for effective prompts:**

```markdown
---
name: code-reviewer
description: Analyzes code changes for quality, security, and maintainability
tools: Read, Grep, Bash(git *)
model: sonnet
---

# Code Reviewer Agent

You are an expert code reviewer specializing in [language/framework].

## Your Role

Review code changes thoroughly for:
1. Code quality and readability
2. Security vulnerabilities
3. Performance issues
4. Best practices adherence
5. Test coverage

## Review Process

1. **Read the changes**
   - Get recent git diff or specified files
   - Understand the context and purpose

2. **Analyze systematically**
   - Check each category (quality, security, performance, etc.)
   - Provide specific file:line references
   - Explain why something is an issue

3. **Provide actionable feedback**
   Format:
   ### 🔴 Critical Issues
   - [Issue] (file.ts:42) - [Explanation] - [Fix]

   ### 🟡 Suggestions
   - [Improvement] (file.ts:67) - [Rationale] - [Recommendation]

   ### ✅ Good Practices
   - [What was done well]

4. **Summarize**
   - Overall assessment
   - Top 3 priorities
   - Approval status (approve, approve with comments, request changes)

## Quality Standards

**Code must:**
- [ ] Follow language/framework conventions
- [ ] Have proper error handling
- [ ] Include necessary tests
- [ ] Not expose secrets or sensitive data
- [ ] Use appropriate abstractions (not over-engineered)

**Flag immediately:**
- SQL injection risks
- XSS vulnerabilities
- Hardcoded credentials
- Memory leaks
- O(n²) or worse algorithms in hot paths

## Output Format

Always provide:
1. Summary (1-2 sentences)
2. Categorized findings with file:line refs
3. Approval decision
4. Top 3 action items

Be thorough but concise. Focus on what matters.
```

### Step 4: Configure Tools Access

**Available tools:**
- `Read` - Read files
- `Write` - Create new files
- `Edit` - Modify existing files
- `Bash` - Execute shell commands
- `Grep` - Search file contents
- `Glob` - Find files by pattern
- `WebFetch` - Fetch web content
- `WebSearch` - Search the web
- Plus any connected MCP tools

**Tool configuration patterns:**

**Inherit all tools** (omit `tools` field):
```yaml
---
name: full-access-agent
description: Agent needs access to everything
# No tools field = inherits all
---
```

**Specific tools only**:
```yaml
---
name: read-only-reviewer
description: Reviews code without making changes
tools: Read, Grep, Bash(git *)
---
```

**Bash with restrictions**:
```yaml
---
name: git-helper
description: Git operations only
tools: Bash(git *), Read
---
```

**Security best practice:** Grant minimum necessary tools. Don't give `Write` or `Bash` unless required.

### Step 5: Choose Model

**Model options:**
- `sonnet` - Balanced, good for most agents (default)
- `opus` - Complex reasoning, architectural decisions
- `haiku` - Fast, simple tasks (formatting, quick checks)
- `inherit` - Use main conversation's model

**When to use each:**

**Sonnet (most agents):**
```yaml
model: sonnet
```
- Code review
- Debugging
- Data analysis
- General problem-solving

**Opus (complex reasoning):**
```yaml
model: opus
```
- Architecture decisions
- Complex refactoring
- Deep security analysis
- Novel problem-solving

**Haiku (speed matters):**
```yaml
model: haiku
```
- Syntax checks
- Simple formatting
- Quick validations
- Low-latency needs

**Inherit (context-dependent):**
```yaml
model: inherit
```
- Agent should match user's model choice
- Cost sensitivity

### Step 6: Write Clear Description

The `description` field determines when Claude invokes your agent automatically.

**Best practices:**
- Start with "Use when..." or "Analyzes..." or "Helps with..."
- Be specific about the agent's domain
- Mention key capabilities
- Include when NOT to use (if helpful)

**Examples:**

✅ **Good descriptions:**
```yaml
description: Analyzes code changes for quality, security, and maintainability issues
description: Use when debugging errors - performs root cause analysis and suggests minimal fixes
description: Helps with SQL query optimization and data analysis tasks
```

❌ **Poor descriptions:**
```yaml
description: A helpful agent  # Too vague
description: Does code stuff  # Not specific enough
description: Reviews, debugs, refactors, tests, documents, and deploys code  # Too broad
```

## Agent Patterns

### Pattern 1: Code Reviewer

**Purpose:** Systematic code review with quality gates

```markdown
---
name: code-reviewer
description: Reviews code changes for quality, security, performance, and best practices
tools: Read, Grep, Bash(git *)
model: sonnet
---

# Code Reviewer

Expert code reviewer for [your tech stack].

## Review Categories

### 1. Code Quality (0-10)
- Readability and clarity
- Naming conventions
- Function/class size
- Comments and documentation

### 2. Security (0-10)
- Input validation
- SQL injection risks
- XSS vulnerabilities
- Secrets exposure
- Authentication/authorization

### 3. Performance (0-10)
- Algorithm efficiency
- Resource usage
- Caching strategy
- Database queries

### 4. Testing (0-10)
- Test coverage
- Edge cases
- Integration tests
- Test quality

## Process

1. Get changes: `git diff main...HEAD`
2. Review each file systematically
3. Score each category
4. Provide specific file:line feedback
5. Recommend: Approve | Approve with comments | Request changes

## Output Template

**Overall: X/40**

### Critical Issues (must fix)
- [Issue] (file:line) - [Why] - [How to fix]

### Suggestions (should fix)
- [Improvement] (file:line) - [Rationale]

### Positive Notes
- [What was done well]

**Decision:** [Approve/Approve with comments/Request changes]
**Top 3 Priorities:**
1. [Action]
2. [Action]
3. [Action]
```

### Pattern 2: Debugger

**Purpose:** Root cause analysis and targeted fixes

```markdown
---
name: debugger
description: Specializes in root cause analysis and minimal fixes for bugs and errors
tools: Read, Edit, Bash, Grep
model: sonnet
---

# Debugger Agent

Expert at finding and fixing bugs through systematic analysis.

## Debugging Process

### 1. Capture Context
- What error/unexpected behavior occurred?
- Error messages and stack traces
- Steps to reproduce
- Expected vs actual behavior

### 2. Isolate the Problem
- Read relevant files
- Trace execution path
- Identify failure point
- Determine root cause (not just symptoms)

### 3. Minimal Fix
- Fix the root cause, not symptoms
- Make smallest change that works
- Don't refactor unrelated code
- Preserve existing behavior

### 4. Verify
- How to test the fix
- Edge cases to check
- Potential side effects

## Anti-Patterns to Avoid

❌ Fixing symptoms instead of root cause
❌ Large refactoring during debugging
❌ Adding features while fixing bugs
❌ Changing working code unnecessarily

## Output Format

**Root Cause:** [Clear explanation]

**Location:** file.ts:line

**Fix:** [Minimal code change]

**Verification:** [How to test]

**Side Effects:** [Potential impacts]
```

### Pattern 3: Data Scientist

**Purpose:** SQL optimization and data analysis

```markdown
---
name: data-scientist
description: Optimizes SQL queries and performs data analysis with cost-awareness
tools: Read, Write, Bash, WebSearch
model: sonnet
---

# Data Scientist Agent

Expert in SQL optimization and data analysis.

## SQL Query Guidelines

### Performance
- Always include WHERE clauses with indexed columns
- Use appropriate JOINs (avoid cartesian products)
- Limit result sets with LIMIT
- Use EXPLAIN to verify query plans

### Cost Awareness
- Estimate query cost before running
- Prefer indexed lookups over full table scans
- Use materialized views for expensive aggregations
- Sample large datasets when appropriate

### Best Practices
- Use CTEs for readability
- Parameterize queries (prevent SQL injection)
- Document complex queries
- Format for readability

## Analysis Process

1. **Understand the question**
   - What insights are needed?
   - What's the business context?

2. **Design query**
   - Choose appropriate tables
   - Apply necessary filters
   - Optimize for performance

3. **Run and validate**
   - Check results make sense
   - Verify data quality
   - Note any anomalies

4. **Present findings**
   - Summary (key insights)
   - Visualizations (if helpful)
   - Recommendations
   - Query for reproducibility

## Output Template

**Question:** [What we're analyzing]

**Query:**
\`\`\`sql
-- [Comment explaining approach]
SELECT ...
FROM ...
WHERE ...
\`\`\`

**Results:** [Summary]

**Insights:**
- [Key finding 1]
- [Key finding 2]
- [Key finding 3]

**Recommendations:** [Data-driven suggestions]

**Cost Estimate:** [Expected query cost]
```

### Pattern 4: Test Generator

**Purpose:** Generate comprehensive test suites

```markdown
---
name: test-generator
description: Generates comprehensive test cases covering happy path, edge cases, and errors
tools: Read, Write
model: sonnet
---

# Test Generator Agent

Generates thorough test suites for code.

## Test Coverage Strategy

### 1. Happy Path (40%)
- Normal inputs
- Expected outputs
- Standard workflows
- Common use cases

### 2. Edge Cases (30%)
- Empty inputs
- Null/undefined
- Boundary values
- Maximum values
- Minimum values
- Unicode/special characters

### 3. Error Cases (20%)
- Invalid inputs
- Type mismatches
- Missing required fields
- Network failures
- Permission errors

### 4. Integration (10%)
- Component interaction
- API contracts
- Database operations
- External dependencies

## Test Structure

\`\`\`typescript
describe('[Component/Function]', () => {
  describe('Happy Path', () => {
    it('should [expected behavior]', () => {
      // Arrange
      // Act
      // Assert
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty input', () => {})
    it('should handle null', () => {})
    it('should handle boundary values', () => {})
  })

  describe('Error Cases', () => {
    it('should throw on invalid input', () => {})
    it('should handle network failure', () => {})
  })
})
\`\`\`

## Test Quality Checklist

- [ ] Descriptive test names ("should..." format)
- [ ] Clear arrange-act-assert structure
- [ ] One assertion per test (generally)
- [ ] No test interdependencies
- [ ] Fast execution (<100ms per test ideally)
- [ ] Easy to understand failures

## Output

Generate complete test file with:
- Imports and setup
- Test suites organized by category
- All test cases with assertions
- Cleanup/teardown if needed
```

## Using Agents

### Automatic Delegation

Claude will automatically invoke agents when:
- Task matches agent description
- Agent is appropriate for context
- More efficient than main conversation

**Example:**
```
User: "Can you review my recent code changes?"
→ Claude invokes code-reviewer agent
```

### Explicit Invocation

Request specific agents:
```
"Use the debugger subagent to find why this test is failing"
"Have the data-scientist subagent analyze user retention"
"Ask the code-reviewer to check this PR"
```

### Agent Chaining

Sequence multiple agents for complex workflows:
```
"First use code-analyzer to find performance bottlenecks,
then use optimizer to fix them,
finally use test-generator to verify the changes"
```

## Agents vs Skills vs Commands

### Use Subagents When:
- ✅ Complex multi-step workflows
- ✅ Specialized expertise needed
- ✅ Delegation improves main context efficiency
- ✅ Repeatable process with quality standards
- ✅ Need focused context window

### Use Skills When:
- ✅ Context-aware automatic activation
- ✅ Reference documentation and patterns
- ✅ Multiple supporting files needed
- ✅ Team standardization required

### Use Slash Commands When:
- ✅ Simple, focused tasks
- ✅ Frequent manual invocation
- ✅ Prompt fits in one file
- ✅ Personal productivity shortcuts

**Decision Tree:**

```
Need specialized AI behavior?
├─ Yes → Complex workflow?
│         ├─ Yes → Use Subagent
│         └─ No → Simple prompt?
│                 ├─ Yes → Use Slash Command
│                 └─ No → Use Skill (reference docs)
└─ No → Just need documentation? → Use Skill
```

## Managing Agents

### View Agents

Use `/agents` command to:
- List all available agents
- See agent descriptions
- Check tool permissions
- View model configurations

### Create Agent with Claude

Recommended approach:
```
"Create a subagent for [purpose] that [capabilities]"
```

Claude will generate:
- Appropriate name
- Clear description
- System prompt
- Tool configuration
- Model selection

Then review and customize as needed.

### Edit Agents

1. Open agent file (`.claude/agents/agent-name.md`)
2. Modify frontmatter or system prompt
3. Save file
4. Changes apply immediately (no restart needed)

### Test Agents

Verify agent works as expected:
```
"Use the [agent-name] subagent to [test task]"
```

Check:
- Agent activates correctly
- Has necessary tool access
- Produces expected output format
- Handles edge cases

## Best Practices

### 1. Single Responsibility

Each agent should do ONE thing exceptionally well.

❌ **Anti-pattern:**
```yaml
name: code-helper
description: Reviews, debugs, tests, refactors, and documents code
```

✅ **Better:**
```yaml
name: code-reviewer
description: Reviews code for quality, security, and best practices
```
```yaml
name: debugger
description: Root cause analysis and minimal fixes for bugs
```

### 2. Detailed System Prompts

Include:
- Role definition
- Step-by-step process
- Output format
- Quality standards
- Examples
- Anti-patterns to avoid

### 3. Minimum Tool Access

Grant only necessary tools:

❌ **Anti-pattern:**
```yaml
tools: Read, Write, Edit, Bash, Grep, Glob, WebSearch, WebFetch
# Agent only needs Read and Grep
```

✅ **Better:**
```yaml
tools: Read, Grep
```

### 4. Clear Output Formats

Define expected structure in system prompt:

```markdown
## Output Format

**Summary:** [1-2 sentence overview]

**Findings:**
- [Category]: [Specific finding] (file:line)

**Recommendations:**
1. [Priority action]
2. [Priority action]
3. [Priority action]
```

### 5. Version Control

Store project agents in git:
- `.claude/agents/` committed to repo
- Team can collaborate on improvements
- Track changes over time
- Share best practices

### 6. Iterative Improvement

Start simple, refine based on usage:

**v1:** Basic functionality
```yaml
description: Reviews code
```

**v2:** More specific
```yaml
description: Reviews code for security vulnerabilities
```

**v3:** Comprehensive
```yaml
description: Reviews code for security vulnerabilities including SQL injection, XSS, CSRF, and secrets exposure
```

## Troubleshooting

### Agent Not Activating

**Problem:** Agent doesn't get invoked when expected

**Solutions:**
1. Check description is specific and matches use case
2. Verify agent file is in `.claude/agents/`
3. Request explicitly: "Use the [agent-name] subagent"
4. Check for file syntax errors in frontmatter

### Tool Permission Denied

**Problem:** Agent can't access needed tools

**Solutions:**
1. Add tools to frontmatter: `tools: Read, Write, Bash`
2. Check Bash patterns: `Bash(git *)` not just `Bash`
3. Omit `tools` field to inherit all tools
4. Use `/agents` to verify tool configuration

### Agent Output Format Wrong

**Problem:** Agent doesn't produce expected format

**Solutions:**
1. Add explicit format to system prompt
2. Include example output
3. Use template/checklist in prompt
4. Test with various inputs

### Agent Too Slow

**Problem:** Agent takes too long to respond

**Solutions:**
1. Use `model: haiku` for faster responses
2. Limit tool usage in prompt
3. Reduce scope of agent responsibility
4. Consider if task better suited for skill/command

## Advanced Patterns

### Conditional Agent Chains

```
"If the code-reviewer finds critical issues,
use the auto-fixer subagent to resolve them,
then re-review with code-reviewer"
```

### Dynamic Tool Access

Some agents may need different tools for different tasks:

```yaml
tools: Read, Grep, Bash(git *), Bash(npm test:*)
```

### Multi-Model Workflow

```
Use opus for architecture decisions →
Use sonnet for implementation →
Use haiku for formatting checks
```

## Example Agent Library

### code-reviewer
**Purpose:** Code quality, security, and best practices
**Tools:** Read, Grep, Bash(git *)
**Model:** sonnet

### debugger
**Purpose:** Root cause analysis and minimal fixes
**Tools:** Read, Edit, Bash, Grep
**Model:** sonnet

### test-generator
**Purpose:** Comprehensive test suite generation
**Tools:** Read, Write
**Model:** sonnet

### data-scientist
**Purpose:** SQL optimization and data analysis
**Tools:** Read, Write, Bash, WebSearch
**Model:** sonnet

### security-auditor
**Purpose:** Deep security vulnerability analysis
**Tools:** Read, Grep, WebSearch
**Model:** opus

### performance-optimizer
**Purpose:** Performance bottleneck identification and fixes
**Tools:** Read, Edit, Bash
**Model:** sonnet

### docs-writer
**Purpose:** API documentation and README generation
**Tools:** Read, Write, Bash(git *)
**Model:** sonnet

## Related Documentation

- **EXAMPLES.md** - Complete agent implementations
- **PATTERNS.md** - Reusable agent patterns
- **TOOLS.md** - Tool configuration reference

## Checklist for New Agents

Before finalizing a subagent:

- [ ] Name is clear, unique, and lowercase with hyphens
- [ ] Description specifically explains when to use the agent
- [ ] System prompt is detailed with step-by-step process
- [ ] Output format is explicitly defined
- [ ] Tool access is minimal and specific
- [ ] Model is appropriate for task complexity
- [ ] Agent has been tested with real tasks
- [ ] Edge cases are considered in prompt
- [ ] File is in correct directory (.claude/agents/)

**Remember:** Great subagents are specialized experts, not generalists. Focus each agent on doing ONE thing exceptionally well with clear processes and measurable outcomes.
