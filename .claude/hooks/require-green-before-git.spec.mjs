import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGitWriteCommand, decisionFor } from './require-green-before-git.mjs';

const green = () => [];
const red = () => [{ name: 'lint:ui', output: "hardcoded color: DefaultColor: '#6366f1'," }];
const unrunnable = () => { throw new Error('turbo entry point not found'); };

test('a plain commit is a git write', () => {
    assert.equal(isGitWriteCommand('git commit -m "x"'), true);
});

test('a push is a git write', () => {
    assert.equal(isGitWriteCommand('git push origin HEAD:next'), true);
});

test('a git write buried in a compound command is still a git write', () => {
    assert.equal(isGitWriteCommand('npm run build && git commit -am wip'), true);
});

test('a -C form is still a git write', () => {
    assert.equal(isGitWriteCommand('git -C /tmp/x commit -m y'), true);
});

// Allow-cases. Without these a future "deny everything" would pass as a fix.
test('reads are not git writes', () => {
    assert.equal(isGitWriteCommand('git status'), false);
    assert.equal(isGitWriteCommand('git log --oneline -5'), false);
    assert.equal(isGitWriteCommand('git diff HEAD~1'), false);
    assert.equal(isGitWriteCommand('git add -A'), false);
});

test('a word merely containing commit or push is not a git write', () => {
    assert.equal(isGitWriteCommand('grep -rn "git commit" docs/'), false);
    assert.equal(isGitWriteCommand('echo pushing'), false);
    assert.equal(isGitWriteCommand('npm run commitpush'), false);
});

test('an unrelated command is not a git write', () => {
    assert.equal(isGitWriteCommand('ls -la'), false);
});

test('command substitution does not hide a git write', () => {
    assert.equal(isGitWriteCommand('out=$(git commit -m "x" 2>&1)'), true);
    assert.equal(isGitWriteCommand('(git commit -m x)'), true);
    assert.equal(isGitWriteCommand('`git push`'), true);
});

// macOS and Windows both mount case-insensitive, so `Git commit` really runs git — the same
// bypass block-generated-edits.mjs was bitten by.
test('a shifted capital does not hide a git write', () => {
    assert.equal(isGitWriteCommand('Git commit -m x'), true);
    assert.equal(isGitWriteCommand('GIT PUSH origin next'), true);
});

test('an env-prefixed git write is still a git write', () => {
    assert.equal(isGitWriteCommand('GIT_AUTHOR_DATE=x git commit -m y'), true);
});

test('a longer subcommand that merely starts with commit or push is not a git write', () => {
    assert.equal(isGitWriteCommand('git commitpush'), false);
    assert.equal(isGitWriteCommand('git pushall'), false);
});

test('a non-git command never runs the checks at all', () => {
    let ran = false;
    const result = decisionFor({ command: 'ls', runChecks: () => { ran = true; return []; } });
    assert.equal(result.decision, 'allow');
    assert.equal(ran, false);
});

test('a green commit is allowed', () => {
    assert.equal(decisionFor({ command: 'git commit -m x', runChecks: green }).decision, 'allow');
});

test('a red commit is denied, and the reason names the failure', () => {
    const result = decisionFor({ command: 'git commit -m x', runChecks: red });
    assert.equal(result.decision, 'deny');
    assert.match(result.reason, /lint:ui/);
    assert.match(result.reason, /#6366f1/);
});

// The whole point of the hook is that a check nobody can run must not read as a check that passed.
test('checks that cannot run ask rather than silently allowing', () => {
    const result = decisionFor({ command: 'git commit -m x', runChecks: unrunnable });
    assert.equal(result.decision, 'ask');
    assert.match(result.reason, /turbo entry point not found/);
});
