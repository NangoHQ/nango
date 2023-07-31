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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiLi9naXRodWItaXNzdWVzLnRzIiwic291cmNlcyI6WyIuL2dpdGh1Yi1pc3N1ZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFQSxTQUE4QixTQUFTLENBQUMsS0FBZ0I7Ozs7O3dCQUV0QyxxQkFBTSxRQUFRLENBQUMsS0FBSyxFQUFFLGFBQWEsQ0FBQyxFQUFBOztvQkFBNUMsS0FBSyxHQUFHLFNBQW9DO3dDQUV6QyxJQUFJOzs7O3dDQUNJLHFCQUFNLFFBQVEsQ0FBQyxLQUFLLEVBQUUsaUJBQVUsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLGNBQUksSUFBSSxDQUFDLElBQUksWUFBUyxDQUFDLEVBQUE7O29DQUFoRixNQUFNLEdBQUcsU0FBdUU7b0NBRXBGLDJCQUEyQjtvQ0FDM0IsTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBQSxLQUFLLElBQUksT0FBQSxDQUFDLENBQUMsY0FBYyxJQUFJLEtBQUssQ0FBQyxFQUExQixDQUEwQixDQUFDLENBQUM7b0NBRXhELFlBQVksR0FBa0IsTUFBTSxDQUFDLEdBQUcsQ0FBQyxVQUFBLEtBQUssSUFBSSxPQUFBLENBQUM7d0NBQ25ELEVBQUUsRUFBRSxLQUFLLENBQUMsRUFBRTt3Q0FDWixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLO3dDQUN2QixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7d0NBQ2YsWUFBWSxFQUFFLEtBQUssQ0FBQyxNQUFNO3dDQUMxQixLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUs7d0NBQ2xCLEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSzt3Q0FDbEIsTUFBTSxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSzt3Q0FDeEIsU0FBUyxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRTt3Q0FDeEIsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJO3dDQUNoQixZQUFZLEVBQUUsS0FBSyxDQUFDLFVBQVU7d0NBQzlCLGtCQUFrQixFQUFFLEtBQUssQ0FBQyxVQUFVO3FDQUN2QyxDQUFDLEVBWm9ELENBWXBELENBQUMsQ0FBQzt5Q0FFQSxDQUFBLFlBQVksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFBLEVBQXZCLHdCQUF1QjtvQ0FDdkIscUJBQU0sS0FBSyxDQUFDLFNBQVMsQ0FBQyxZQUFZLEVBQUUsYUFBYSxDQUFDLEVBQUE7O29DQUFsRCxTQUFrRCxDQUFDOzs7Ozs7MEJBckJyQyxFQUFMLGVBQUs7Ozt5QkFBTCxDQUFBLG1CQUFLLENBQUE7b0JBQWIsSUFBSTtrREFBSixJQUFJOzs7OztvQkFBSSxJQUFLLENBQUE7O3dCQXlCdEIsc0JBQU8sRUFBQyxXQUFXLEVBQUUsRUFBRSxFQUFDLEVBQUM7Ozs7Q0FDNUI7QUE5QkQsNEJBOEJDO0FBRUQsU0FBZSxRQUFRLENBQUMsS0FBZ0IsRUFBRSxRQUFnQjs7Ozs7O29CQUNoRCxRQUFRLEdBQUcsR0FBRyxDQUFDO29CQUNqQixPQUFPLEdBQVUsRUFBRSxDQUFDO29CQUNwQixJQUFJLEdBQUcsQ0FBQyxDQUFDOzs7eUJBQ04sSUFBSTtvQkFDTSxxQkFBTSxLQUFLLENBQUMsR0FBRyxDQUFDOzRCQUN6QixRQUFRLEVBQUUsUUFBUTs0QkFDbEIsTUFBTSxFQUFFO2dDQUNKLEtBQUssRUFBRSxVQUFHLFFBQVEsQ0FBRTtnQ0FDcEIsSUFBSSxFQUFFLFVBQUcsSUFBSSxDQUFFOzZCQUNsQjt5QkFDSixDQUFDLEVBQUE7O29CQU5JLElBQUksR0FBRyxTQU1YO29CQUVGLE9BQU8sR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFFcEMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sSUFBSSxRQUFRLEVBQUU7d0JBQzlCLElBQUksSUFBSSxDQUFDLENBQUM7cUJBQ2I7eUJBQU07d0JBQ0gsd0JBQU07cUJBQ1Q7O3dCQUdMLHNCQUFPLE9BQU8sRUFBQzs7OztDQUNsQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IE5hbmdvU3luYywgR2l0aHViSXNzdWUgfSBmcm9tICcuL21vZGVscyc7XG5cbmV4cG9ydCBkZWZhdWx0IGFzeW5jIGZ1bmN0aW9uIGZldGNoRGF0YShuYW5nbzogTmFuZ29TeW5jKTogUHJvbWlzZTx7R2l0aHViSXNzdWU6IEdpdGh1Yklzc3VlW119PiB7XG5cbiAgICBjb25zdCByZXBvcyA9IGF3YWl0IHBhZ2luYXRlKG5hbmdvLCAnL3VzZXIvcmVwb3MnKTtcblxuICAgIGZvciAobGV0IHJlcG8gb2YgcmVwb3MpIHtcbiAgICAgICAgbGV0IGlzc3VlcyA9IGF3YWl0IHBhZ2luYXRlKG5hbmdvLCBgL3JlcG9zLyR7cmVwby5vd25lci5sb2dpbn0vJHtyZXBvLm5hbWV9L2lzc3Vlc2ApO1xuXG4gICAgICAgIC8vIEZpbHRlciBvdXQgcHVsbCByZXF1ZXN0c1xuICAgICAgICBpc3N1ZXMgPSBpc3N1ZXMuZmlsdGVyKGlzc3VlID0+ICEoJ3B1bGxfcmVxdWVzdCcgaW4gaXNzdWUpKTtcblxuICAgICAgICBsZXQgbWFwcGVkSXNzdWVzOiBHaXRodWJJc3N1ZVtdID0gaXNzdWVzLm1hcChpc3N1ZSA9PiAoe1xuICAgICAgICAgICAgaWQ6IGlzc3VlLmlkLFxuICAgICAgICAgICAgb3duZXI6IHJlcG8ub3duZXIubG9naW4sXG4gICAgICAgICAgICByZXBvOiByZXBvLm5hbWUsXG4gICAgICAgICAgICBpc3N1ZV9udW1iZXI6IGlzc3VlLm51bWJlcixcbiAgICAgICAgICAgIHRpdGxlOiBpc3N1ZS50aXRsZSxcbiAgICAgICAgICAgIHN0YXRlOiBpc3N1ZS5zdGF0ZSxcbiAgICAgICAgICAgIGF1dGhvcjogaXNzdWUudXNlci5sb2dpbixcbiAgICAgICAgICAgIGF1dGhvcl9pZDogaXNzdWUudXNlci5pZCxcbiAgICAgICAgICAgIGJvZHk6IGlzc3VlLmJvZHksXG4gICAgICAgICAgICBkYXRlX2NyZWF0ZWQ6IGlzc3VlLmNyZWF0ZWRfYXQsXG4gICAgICAgICAgICBkYXRlX2xhc3RfbW9kaWZpZWQ6IGlzc3VlLnVwZGF0ZWRfYXRcbiAgICAgICAgfSkpO1xuXG4gICAgICAgIGlmIChtYXBwZWRJc3N1ZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgYXdhaXQgbmFuZ28uYmF0Y2hTZW5kKG1hcHBlZElzc3VlcywgJ0dpdGh1Yklzc3VlJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge0dpdGh1Yklzc3VlOiBbXX07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHBhZ2luYXRlKG5hbmdvOiBOYW5nb1N5bmMsIGVuZHBvaW50OiBzdHJpbmcpIHtcbiAgICBjb25zdCBNQVhfUEFHRSA9IDEwMDtcbiAgICBsZXQgcmVzdWx0czogYW55W10gPSBbXTtcbiAgICBsZXQgcGFnZSA9IDE7XG4gICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgY29uc3QgcmVzcCA9IGF3YWl0IG5hbmdvLmdldCh7XG4gICAgICAgICAgICBlbmRwb2ludDogZW5kcG9pbnQsXG4gICAgICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICAgICAgICBsaW1pdDogYCR7TUFYX1BBR0V9YCxcbiAgICAgICAgICAgICAgICBwYWdlOiBgJHtwYWdlfWBcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmVzdWx0cyA9IHJlc3VsdHMuY29uY2F0KHJlc3AuZGF0YSk7XG5cbiAgICAgICAgaWYgKHJlc3AuZGF0YS5sZW5ndGggPT0gTUFYX1BBR0UpIHtcbiAgICAgICAgICAgIHBhZ2UgKz0gMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIHJldHVybiByZXN1bHRzO1xufVxuIl19