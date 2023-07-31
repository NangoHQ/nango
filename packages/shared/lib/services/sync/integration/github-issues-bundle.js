(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
function fetchData(nango) {
    return __awaiter(this, void 0, void 0, function () {
        var repos, _loop_1, _i, repos_1, repo;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, paginate(nango, '/user/repos')];
                case 1:
                    repos = _a.sent();
                    _loop_1 = function (repo) {
                        var issues, mappedIssues;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0: return [4 /*yield*/, paginate(nango, "/repos/".concat(repo.owner.login, "/").concat(repo.name, "/issues"))];
                                case 1:
                                    issues = _b.sent();
                                    // Filter out pull requests
                                    issues = issues.filter(function (issue) { return !('pull_request' in issue); });
                                    mappedIssues = issues.map(function (issue) { return ({
                                        id: issue.id,
                                        owner: repo.owner.login,
                                        repo: repo.name,
                                        issue_number: issue.number,
                                        title: issue.title,
                                        state: issue.state,
                                        author: issue.user.login,
                                        author_id: issue.user.id,
                                        body: issue.body,
                                        date_created: issue.created_at,
                                        date_last_modified: issue.updated_at
                                    }); });
                                    if (!(mappedIssues.length > 0)) return [3 /*break*/, 3];
                                    return [4 /*yield*/, nango.batchSend(mappedIssues, 'GithubIssue')];
                                case 2:
                                    _b.sent();
                                    _b.label = 3;
                                case 3: return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, repos_1 = repos;
                    _a.label = 2;
                case 2:
                    if (!(_i < repos_1.length)) return [3 /*break*/, 5];
                    repo = repos_1[_i];
                    return [5 /*yield**/, _loop_1(repo)];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/, { GithubIssue: [] }];
            }
        });
    });
}
exports.default = fetchData;
function paginate(nango, endpoint) {
    return __awaiter(this, void 0, void 0, function () {
        var MAX_PAGE, results, page, resp;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    MAX_PAGE = 100;
                    results = [];
                    page = 1;
                    _a.label = 1;
                case 1:
                    if (!true) return [3 /*break*/, 3];
                    return [4 /*yield*/, nango.get({
                            endpoint: endpoint,
                            params: {
                                limit: "".concat(MAX_PAGE),
                                page: "".concat(page)
                            }
                        })];
                case 2:
                    resp = _a.sent();
                    results = results.concat(resp.data);
                    if (resp.data.length == MAX_PAGE) {
                        page += 1;
                    }
                    else {
                        return [3 /*break*/, 3];
                    }
                    return [3 /*break*/, 1];
                case 3: return [2 /*return*/, results];
            }
        });
    });
}

},{}]},{},[1]);
