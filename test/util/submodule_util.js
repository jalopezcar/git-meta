/*
 * Copyright (c) 2016, Two Sigma Open Source
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice,
 *   this list of conditions and the following disclaimer.
 *
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * * Neither the name of git-meta nor the names of its
 *   contributors may be used to endorse or promote products derived from
 *   this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */
"use strict";

const assert  = require("chai").assert;
const co      = require("co");
const NodeGit = require("nodegit");
const path    = require("path");

const RepoASTTestUtil     = require("../../lib/util/repo_ast_test_util");
const TestUtil            = require("../../lib/util/test_util");
const SubmoduleUtil       = require("../../lib/util/submodule_util");

describe("SubmoduleUtil", function () {
    after(TestUtil.cleanup);

    describe("getSubmoduleNames", function () {
        const cases = {
            "none": {
                state: "S",
                expected: [],
            },
            "one": {
                state: "S:C2-1 foo=S/a:1;H=2",
                expected: ["foo"],
            },
            "two": {
                state: "S:C2-1 foo=S/a:1;C3-2 bar=S/b:2;H=3",
                expected: ["foo", "bar"],
            },
            "one in index": {
                state: "S:I foo=S/a:1",
                expected: ["foo"],
            },
        };
        Object.keys(cases).forEach(caseName => {
            const c = cases[caseName];
            it(caseName, co.wrap(function *() {
                const repo = (yield RepoASTTestUtil.createRepo(c.state)).repo;
                const names = yield SubmoduleUtil.getSubmoduleNames(repo);
                assert.deepEqual(names.sort(), c.expected.sort());
            }));
        });
    });

    describe("getSubmoduleNamesForCommit", function () {
        const cases = {
            "none": {
                state: "S",
                commit: "1",
                expected: [],
            },
            "one": {
                state: "S:C2-1 foo=S/a:1;H=2",
                commit: "2",
                expected: ["foo"],
            },
            "two": {
                state: "S:C2-1 foo=S/a:1;C3-2 bar=S/b:2;H=3",
                commit: "3",
                expected: ["foo", "bar"],
            },
            "none from earlier commit": {
                state: "S:C2-1 foo=S/a:1;C3-2 bar=S/b:2;H=3",
                commit: "1",
                expected: [],
            },
            "not from index": {
                state: "S:I foo=S/a:1",
                commit: "1",
                expected: [],
            }
        };
        Object.keys(cases).forEach(caseName => {
            const c = cases[caseName];
            it(caseName, co.wrap(function *() {
                const result = yield RepoASTTestUtil.createRepo(c.state);
                const repo = result.repo;
                const mappedCommitSha = result.oldCommitMap[c.commit];
                const commit = yield repo.getCommit(mappedCommitSha);
                const names = yield SubmoduleUtil.getSubmoduleNamesForCommit(
                                                                       repo,
                                                                       commit);
                assert.deepEqual(names.sort(), c.expected.sort());
            }));
        });
    });

    describe("getSubmoduleNamesForBranch", function () {
        // This method is implemented in terms of `getSubmoduleNamesForCommit`;
        // we just need to do basic verification.

        const cases = {
            "none": { state: "S", branch: "master", expected: [], },
            "from master": {
                state: "S:C2-1 foo=S/a:1;Bmaster=2",
                branch: "master",
                expected: ["foo"],
            },
            "from another": {
                state: "S:C2-1 foo=S/a:1;Bbar=2",
                branch: "bar",
                expected: ["foo"],
            },
        };
        Object.keys(cases).forEach(caseName => {
            const c = cases[caseName];
            it(caseName, co.wrap(function *() {
                const repo = (yield RepoASTTestUtil.createRepo(c.state)).repo;
                const names = yield SubmoduleUtil.getSubmoduleNamesForBranch(
                                                                     repo,
                                                                     c.branch);
                assert.deepEqual(names.sort(), c.expected.sort());
            }));
        });
    });

    describe("getSubmoduleShasForCommit", function () {
         const cases = {
            "one": {
                state: "S:C2-1 foo=S/a:1;H=2",
                names: ["foo"],
                commit: "2",
                expected: { foo: "1" },
            },
            "from later commit": {
                state: "S:C2-1 x=S/a:1;C3-2 x=S/a:2;H=3",
                names: ["x"],
                commit: "3",
                expected: { x: "2" },
            },
            "from earlier commit": {
                state: "S:C2-1 x=S/a:1;C3-2 x=S/a:2;H=3",
                names: ["x"],
                commit: "2",
                expected: { x: "1" },
            },
            "one from two": {
                state: "S:C2-1 x=Sa:1,y=Sa:1;H=2",
                names: ["y"],
                commit: "2",
                expected: { y: "1" },
            },
            "two from two": {
                state: "S:C2-1 x=Sa:1,y=Sa:1;H=2",
                names: ["x", "y"],
                commit: "2",
                expected: { x: "1", y: "1" },
            },
        };
        Object.keys(cases).forEach(caseName => {
            const c = cases[caseName];
            it(caseName, co.wrap(function *() {
                const written = yield RepoASTTestUtil.createRepo(c.state);
                const repo = written.repo;
                const mappedCommitSha = written.oldCommitMap[c.commit];
                const commit = yield repo.getCommit(mappedCommitSha);
                const result = yield SubmoduleUtil.getSubmoduleShasForCommit(
                                                                       repo,
                                                                       c.names,
                                                                       commit);
                let mappedResult = {};
                Object.keys(result).forEach((name) => {
                    mappedResult[name] = written.commitMap[result[name]];
                });
                assert.deepEqual(mappedResult, c.expected);
            }));
        });
    });

    describe("getSubmoduleShasForBranch", function () {
        // The implementation of this method is delegated to
        // `getSubmoduleShasForCommit`; just exercise basic functionality.

        it("breathing", co.wrap(function *() {
            const written =
                        yield RepoASTTestUtil.createRepo("S:C2-1 x=Sa:1;Bm=2");
            const repo = written.repo;
            const result =
                    yield SubmoduleUtil.getSubmoduleShasForBranch(repo, "m");
            assert.equal(written.commitMap[result.x], "1");
        }));
    });

    describe("getCurrentSubmoduleShas", function () {
         const cases = {
            "none": {
                state: "S",
                names: [],
                expected: [],
            },
            "one in commit": {
                state: "S:C2-1 x=Sa:1;H=2",
                names: ["x"],
                expected: ["1"],
            },
            "two in commit, one asked": {
                state: "S:C2-1 x=Sa:1;C3-2 y=Sa:2;H=3",
                names: ["x"],
                expected: ["1"],
            },
            "two in commit, two asked": {
                state: "S:C2-1 x=Sa:1;C3-2 y=Sa:2;H=3",
                names: ["x", "y"],
                expected: ["1", "2"],
            },
            "two in commit, second asked": {
                state: "S:C2-1 x=Sa:1;C3-2 y=Sa:2;H=3",
                names: ["y"],
                expected: ["2"],
            },
            "one overriden in index": {
                state: "S:C3-2;C2-1 x=Sa:1;H=3;I x=Sa:2",
                names: ["x"],
                expected: ["2"],
            },
        };
        Object.keys(cases).forEach(caseName => {
            const c = cases[caseName];
            it(caseName, co.wrap(function *() {
                const written = yield RepoASTTestUtil.createRepo(c.state);
                const repo = written.repo;
                const result = yield SubmoduleUtil.getCurrentSubmoduleShas(
                                                                      repo,
                                                                      c.names);
                const mappedResult = result.map(id => written.commitMap[id]);
                assert.deepEqual(mappedResult, c.expected);
            }));
        });
    });

    describe("isVisible", function () {
        // Will have to set up multiple repos this time because we cannot make
        // an open repo in the single repo world.  In each case, we will
        // operate on the repo named "x".

        const cases = {
            "simple not": {
                state: "a=S|x=S:C2-1 a=Sa:1;H=2",
                name: "a",
                expected: false,
            },
            "simple open": {
                state: "a=S|x=S:C2-1 a=Sa:1;Oa;H=2",
                name: "a",
                expected: true,
            },
        };
        Object.keys(cases).forEach(caseName => {
            const c = cases[caseName];
            it(caseName, co.wrap(function *() {
                const w = yield RepoASTTestUtil.createMultiRepos(c.state);
                const x = w.repos.x;
                const result = yield SubmoduleUtil.isVisible(x, c.name);
                assert.equal(result, c.expected);
            }));
        });
    });

    describe("getRepo", function () {
        // This method is pretty simple; we'll validate that a repo was
        // returned with the expected path of the submodule.

        it("breathing", co.wrap(function *() {
            const shorthand = "a=S|b=S:I x=Sa:1;Ox";
            const written = yield RepoASTTestUtil.createMultiRepos(shorthand);
            const bRepo = written.repos.b;
            const xRepo = yield SubmoduleUtil.getRepo(bRepo, "x");
            assert(TestUtil.isSameRealPath(xRepo.workdir(),
                                           path.join(bRepo.workdir(), "x")));
        }));
    });

    describe("getSubmoduleRepos", function () {
        // The functionality of this method is delegated to
        // `getSubmoduleNames`, `isVisible`, and `getRepo`.  We just need to
        // test basic funtionality:
        // - it screens hidden submodules
        // - it returns visible submods and name map is good
        // - hidden ones are screened

        it("breathing", co.wrap(function *() {
            const shorthand = "a=S|b=S:I x=Sa:1,y=Sa:1;Ox";
            const written = yield RepoASTTestUtil.createMultiRepos(shorthand);
            const bRepo = written.repos.b;
            const result = yield SubmoduleUtil.getSubmoduleRepos(bRepo);
            assert.equal(result.length, 1);
            const x = result[0];
            assert.equal(x.name, "x");
            assert.instanceOf(x.repo, NodeGit.Repository);
        }));
    });

    describe("fetchSubmodule", function () {
        // This method should probably go away, but I'll do a quick test for it
        // anyway.  It defers to `GitUtil.fetch`, so we'll just do basic
        // testing.
        // We'll always do the operation on repo 'x', subrepo 'a'.

        const fetcher = co.wrap(function *(repos) {
            const repo = repos.x;
            const subRepo = yield SubmoduleUtil.getRepo(repo, "a");
            const result = yield SubmoduleUtil.fetchSubmodule(repo, subRepo);
            assert.equal(result, "origin");
        });

        const cases = {
            "nothing fetched": {
                state: "a=S|x=S:C2-1 a=Sa:1;Oa;H=2",
                expected: "a=S|x=S:C2-1 a=Sa:1;Oa;H=2",
            },
            "fetched a branch": {
                state: "a=S:Bfoo=1|x=S:C2-1 a=Sa:1;Oa;H=2",
                expected:
                  "a=S:Bfoo=1|x=S:C2-1 a=Sa:1;Oa Rorigin=a master=1,foo=1;H=2",
            },
        };

        Object.keys(cases).forEach(caseName => {
            const c = cases[caseName];
            it(caseName, co.wrap(function *() {
                yield RepoASTTestUtil.testMultiRepoManipulator(c.state,
                                                               c.expected,
                                                               fetcher);
            }));
        });
    });

    describe("getSubmoduleChanges", function () {
        const cases = {
            "trivial": {
                state: "S",
                from: "1",
                added: [],
                changed: [],
                removed: [],
            },
            "changed something else": {
                state: "S:C2-1 README.md=foo;H=2",
                from: "2",
                added: [],
                changed: [],
                removed: [],
            },
            "removed something else": {
                state: "S:C2-1 README.md;H=2",
                from: "2",
                added: [],
                changed: [],
                removed: [],
            },
            "not on current commit": {
                state: "S:C2-1 x=Sa:1;H=2",
                from: "1",
                added: [],
                changed: [],
                removed: [],
            },
            "added one": {
                state: "S:C2-1 x=Sa:1;H=2",
                from: "2",
                added: ["x"],
                changed: [],
                removed: [],
            },
            "added two": {
                state: "S:C2-1 a=Sa:1,x=Sa:1;H=2",
                from: "2",
                added: ["a", "x"],
                changed: [],
                removed: [],
            },
            "changed one": {
                state: "S:C3-2 a=Sa:2;C2-1 a=Sa:1,x=Sa:1;H=3",
                from: "3",
                added: [],
                changed: ["a"],
                removed: [],
            },
            "changed one url": {
                state: "S:C3-2 a=Sa:2;C2-1 a=Sb:1,x=Sa:1;H=3",
                from: "3",
                added: [],
                changed: ["a"],
                removed: [],
            },
            "changed and added": {
                state: "S:C3-2 a=Sa:2,c=Sa:2;C2-1 a=Sa:1,x=Sa:1;H=3",
                from: "3",
                added: ["c"],
                changed: ["a"],
                removed: [],
            },
            "removed one": {
                state: "S:C3-2 a=;C2-1 a=Sa:1,x=Sa:1;H=3",
                from: "3",
                added: [],
                changed: [],
                removed: ["a"],
            },
            "added and removed": {
                state: "S:C3-2 a,c=Sa:2;C2-1 a=Sa:1,x=Sa:1;H=3",
                from: "3",
                added: ["c"],
                changed: [],
                removed: ["a"],
            },
        };
        Object.keys(cases).forEach(caseName => {
            const c = cases[caseName];
            it(caseName, co.wrap(function *() {
                const written = yield RepoASTTestUtil.createRepo(c.state);
                const repo = written.repo;
                const fromSha = written.oldCommitMap[c.from];
                const fromId = NodeGit.Oid.fromString(fromSha);
                const changes =
                         yield SubmoduleUtil.getSubmoduleChanges(repo, fromId);
                assert.deepEqual(Array.from(changes.added).sort(),
                                 c.added.sort());
                assert.deepEqual(Array.from(changes.changed).sort(),
                                 c.changed.sort());
                assert.deepEqual(Array.from(changes.removed).sort(),
                                 c.removed.sort());
            }));
        });
    });

    describe("syncSubmodules", function () {
        // We will always sync and check "x".

        const cases = {
            "trivial": {
                state: "x=S",
                expected: "x=S",
            },
            "backed up to original commit": {
                state: "a=S|x=S:C2-1 z=Sa:1;H=2;Oz C3-1!H=3",
                expected: "a=S|x=S:C2-1 z=Sa:1;H=2;Oz",
            },
        };

        const syncer = co.wrap(function *(repos) {
            yield SubmoduleUtil.syncSubmodules(repos.x);
        });

        Object.keys(cases).forEach(caseName => {
            const c = cases[caseName];
            it(caseName, co.wrap(function *() {
                yield RepoASTTestUtil.testMultiRepoManipulator(c.state,
                                                               c.expected,
                                                               syncer);
            }));
        });
    });
});
