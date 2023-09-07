'use strict';
var __awaiter =
    (this && this.__awaiter) ||
    function (thisArg, _arguments, P, generator) {
        function adopt(value) {
            return value instanceof P
                ? value
                : new P(function (resolve) {
                      resolve(value);
                  });
        }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) {
                try {
                    step(generator.next(value));
                } catch (e) {
                    reject(e);
                }
            }
            function rejected(value) {
                try {
                    step(generator['throw'](value));
                } catch (e) {
                    reject(e);
                }
            }
            function step(result) {
                result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
            }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    };
var __generator =
    (this && this.__generator) ||
    function (thisArg, body) {
        var _ = {
                label: 0,
                sent: function () {
                    if (t[0] & 1) throw t[1];
                    return t[1];
                },
                trys: [],
                ops: []
            },
            f,
            y,
            t,
            g;
        return (
            (g = { next: verb(0), throw: verb(1), return: verb(2) }),
            typeof Symbol === 'function' &&
                (g[Symbol.iterator] = function () {
                    return this;
                }),
            g
        );
        function verb(n) {
            return function (v) {
                return step([n, v]);
            };
        }
        function step(op) {
            if (f) throw new TypeError('Generator is already executing.');
            while ((g && ((g = 0), op[0] && (_ = 0)), _))
                try {
                    if (
                        ((f = 1),
                        y && (t = op[0] & 2 ? y['return'] : op[0] ? y['throw'] || ((t = y['return']) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done)
                    )
                        return t;
                    if (((y = 0), t)) op = [op[0] & 2, t.value];
                    switch (op[0]) {
                        case 0:
                        case 1:
                            t = op;
                            break;
                        case 4:
                            _.label++;
                            return { value: op[1], done: false };
                        case 5:
                            _.label++;
                            y = op[1];
                            op = [0];
                            continue;
                        case 7:
                            op = _.ops.pop();
                            _.trys.pop();
                            continue;
                        default:
                            if (!((t = _.trys), (t = t.length > 0 && t[t.length - 1])) && (op[0] === 6 || op[0] === 2)) {
                                _ = 0;
                                continue;
                            }
                            if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
                                _.label = op[1];
                                break;
                            }
                            if (op[0] === 6 && _.label < t[1]) {
                                _.label = t[1];
                                t = op;
                                break;
                            }
                            if (t && _.label < t[2]) {
                                _.label = t[2];
                                _.ops.push(op);
                                break;
                            }
                            if (t[2]) _.ops.pop();
                            _.trys.pop();
                            continue;
                    }
                    op = body.call(thisArg, _);
                } catch (e) {
                    op = [6, e];
                    y = 0;
                } finally {
                    f = t = 0;
                }
            if (op[0] & 5) throw op[1];
            return { value: op[0] ? op[1] : void 0, done: true };
        }
    };
Object.defineProperty(exports, '__esModule', { value: true });
function fetchData(nango) {
    return nango.post();
}
exports.default = fetchData;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiLi9nb29nbGUtb3JnLXVuaXQtc3luYy50cyIsInNvdXJjZXMiOlsiLi9nb29nbGUtb3JnLXVuaXQtc3luYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQWtCQSxTQUE4QixTQUFTLENBQUMsS0FBZ0I7Ozs7Ozs7b0JBQzlDLFFBQVEsR0FBRyxtREFBbUQsQ0FBQztvQkFHL0QsUUFBUSxHQUF1Qjt3QkFDakMsSUFBSSxFQUFFLGtCQUFrQjt3QkFDeEIsV0FBVyxFQUFFLGdCQUFnQjt3QkFDN0IsSUFBSSxFQUFFLEdBQUc7d0JBQ1QsRUFBRSxFQUFFLEVBQUU7d0JBQ04sVUFBVSxFQUFFLElBQUk7d0JBQ2hCLFFBQVEsRUFBRSxJQUFJO3dCQUNkLFNBQVMsRUFBRSxJQUFJO3dCQUNmLFNBQVMsRUFBRSxJQUFJO3FCQUNsQixDQUFDOzs7b0JBR1EsTUFBTSxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLFNBQVMsV0FBQSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFDO29CQUV2RCxxQkFBTSxLQUFLLENBQUMsR0FBRyxDQUF3RDs0QkFDcEYsZUFBZSxFQUFFLDhCQUE4Qjs0QkFDL0MsUUFBUSxVQUFBOzRCQUNSLE1BQU0sUUFBQTs0QkFDTixPQUFPLEVBQUUsQ0FBQzt5QkFDYixDQUFDLEVBQUE7O29CQUxJLFFBQVEsR0FBRyxTQUtmO3lCQUVFLENBQUMsUUFBUSxFQUFULHdCQUFTO29CQUNULHFCQUFNLEtBQUssQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUMsRUFBQTs7b0JBQWxELFNBQWtELENBQUM7b0JBQ25ELHNCQUFPLEVBQUUsa0JBQWtCLEVBQUUsRUFBRSxFQUFFLEVBQUM7O29CQUc5QixJQUFJLEdBQUssUUFBUSxLQUFiLENBQWM7eUJBRXRCLElBQUksQ0FBQyxpQkFBaUIsRUFBdEIsd0JBQXNCO3lCQUNsQixDQUFBLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxJQUFJLENBQUMsaUJBQWlCLENBQUMsTUFBTSxHQUFHLENBQUMsS0FBSSxNQUFBLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsMENBQUUsZUFBZSxDQUFBLElBQUksQ0FBQSxNQUFBLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsMENBQUUsaUJBQWlCLE1BQUssR0FBRyxDQUFBLEVBQXZKLHdCQUF1SjtvQkFDdkosUUFBUSxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDO29CQUV4RCxxQkFBTSxLQUFLLENBQUMsU0FBUyxDQUFxQixDQUFDLFFBQVEsQ0FBQyxFQUFFLG9CQUFvQixDQUFDLEVBQUE7O29CQUEzRSxTQUEyRSxDQUFDOzs7b0JBRzFFLEtBQUssR0FBeUIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxVQUFDLEVBQW9CO3dCQUNoRixJQUFNLElBQUksR0FBdUI7NEJBQzdCLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSTs0QkFDYixXQUFXLEVBQUUsRUFBRSxDQUFDLFdBQVc7NEJBQzNCLElBQUksRUFBRSxFQUFFLENBQUMsV0FBVzs0QkFDcEIsRUFBRSxFQUFFLEVBQUUsQ0FBQyxTQUFTOzRCQUNoQixVQUFVLEVBQUUsRUFBRSxDQUFDLGlCQUFpQjs0QkFDaEMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxlQUFlOzRCQUM1QixTQUFTLEVBQUUsSUFBSTs0QkFDZixTQUFTLEVBQUUsSUFBSTt5QkFDbEIsQ0FBQzt3QkFFRixPQUFPLElBQUksQ0FBQztvQkFDaEIsQ0FBQyxDQUFDLENBQUM7b0JBRUgscUJBQU0sS0FBSyxDQUFDLFNBQVMsQ0FBcUIsS0FBSyxFQUFFLG9CQUFvQixDQUFDLEVBQUE7O29CQUF0RSxTQUFzRSxDQUFDOzs7b0JBRzNFLFNBQVMsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQzs7O3dCQUNuQyxTQUFTOzt5QkFFbEIsc0JBQU87d0JBQ0gsa0JBQWtCLEVBQUUsRUFBRTtxQkFDekIsRUFBQzs7OztDQUNMO0FBL0RELDRCQStEQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgTmFuZ29TeW5jLCBPcmdhbml6YXRpb25hbFVuaXQgfSBmcm9tICcuL21vZGVscyc7XG5cbmludGVyZmFjZSBPcmdhbml6YXRpb25Vbml0IHtcbiAgICBraW5kOiBzdHJpbmc7XG4gICAgZXRhZzogc3RyaW5nO1xuICAgIG5hbWU6IHN0cmluZztcbiAgICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICAgIG9yZ1VuaXRQYXRoOiBzdHJpbmc7XG4gICAgb3JnVW5pdElkOiBzdHJpbmc7XG4gICAgcGFyZW50T3JnVW5pdFBhdGg6IHN0cmluZztcbiAgICBwYXJlbnRPcmdVbml0SWQ6IHN0cmluZztcbn1cbmludGVyZmFjZSBPcmdhbml6YXRpb25Vbml0UmVzcG9uc2Uge1xuICAgIGtpbmQ6IHN0cmluZztcbiAgICBldGFnOiBzdHJpbmc7XG4gICAgb3JnYW5pemF0aW9uVW5pdHM6IE9yZ2FuaXphdGlvblVuaXRbXTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgYXN5bmMgZnVuY3Rpb24gZmV0Y2hEYXRhKG5hbmdvOiBOYW5nb1N5bmMpOiBQcm9taXNlPHsgT3JnYW5pemF0aW9uYWxVbml0OiBPcmdhbml6YXRpb25hbFVuaXRbXSB9PiB7XG4gICAgY29uc3QgZW5kcG9pbnQgPSAnL2FkbWluL2RpcmVjdG9yeS92MS9jdXN0b21lci9teV9jdXN0b21lci9vcmd1bml0cyc7XG4gICAgbGV0IHBhZ2VUb2tlbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gICAgY29uc3Qgcm9vdFVuaXQ6IE9yZ2FuaXphdGlvbmFsVW5pdCA9IHtcbiAgICAgICAgbmFtZTogJ3tSb290IERpcmVjdG9yeX0nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1Jvb3QgRGlyZWN0b3J5JyxcbiAgICAgICAgcGF0aDogJy8nLFxuICAgICAgICBpZDogJycsXG4gICAgICAgIHBhcmVudFBhdGg6IG51bGwsXG4gICAgICAgIHBhcmVudElkOiBudWxsLFxuICAgICAgICBjcmVhdGVkQXQ6IG51bGwsXG4gICAgICAgIGRlbGV0ZWRBdDogbnVsbFxuICAgIH07XG5cbiAgICBkbyB7XG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHBhZ2VUb2tlbiA/IHsgdHlwZTogJ2FsbCcsIHBhZ2VUb2tlbiB9IDogeyB0eXBlOiAnYWxsJyB9O1xuXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28uZ2V0PE9yZ2FuaXphdGlvblVuaXRSZXNwb25zZSAmIHsgbmV4dFBhZ2VUb2tlbj86IHN0cmluZyB9Pih7XG4gICAgICAgICAgICBiYXNlVXJsT3ZlcnJpZGU6ICdodHRwczovL2FkbWluLmdvb2dsZWFwaXMuY29tJyxcbiAgICAgICAgICAgIGVuZHBvaW50LFxuICAgICAgICAgICAgcGFyYW1zLFxuICAgICAgICAgICAgcmV0cmllczogNVxuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoIXJlc3BvbnNlKSB7XG4gICAgICAgICAgICBhd2FpdCBuYW5nby5sb2coJ05vIHJlc3BvbnNlIGZyb20gdGhlIEdvb2dsZSBBUEknKTtcbiAgICAgICAgICAgIHJldHVybiB7IE9yZ2FuaXphdGlvbmFsVW5pdDogW10gfTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHsgZGF0YSB9ID0gcmVzcG9uc2U7XG5cbiAgICAgICAgaWYgKGRhdGEub3JnYW5pemF0aW9uVW5pdHMpIHtcbiAgICAgICAgICAgIGlmICghcm9vdFVuaXQuaWQgJiYgZGF0YS5vcmdhbml6YXRpb25Vbml0cy5sZW5ndGggPiAwICYmIGRhdGEub3JnYW5pemF0aW9uVW5pdHNbMF0/LnBhcmVudE9yZ1VuaXRJZCAmJiBkYXRhLm9yZ2FuaXphdGlvblVuaXRzWzBdPy5wYXJlbnRPcmdVbml0UGF0aCA9PT0gJy8nKSB7XG4gICAgICAgICAgICAgICAgcm9vdFVuaXQuaWQgPSBkYXRhLm9yZ2FuaXphdGlvblVuaXRzWzBdLnBhcmVudE9yZ1VuaXRJZDtcblxuICAgICAgICAgICAgICAgIGF3YWl0IG5hbmdvLmJhdGNoU2F2ZTxPcmdhbml6YXRpb25hbFVuaXQ+KFtyb290VW5pdF0sICdPcmdhbml6YXRpb25hbFVuaXQnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgdW5pdHM6IE9yZ2FuaXphdGlvbmFsVW5pdFtdID0gZGF0YS5vcmdhbml6YXRpb25Vbml0cy5tYXAoKG91OiBPcmdhbml6YXRpb25Vbml0KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdW5pdDogT3JnYW5pemF0aW9uYWxVbml0ID0ge1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBvdS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogb3UuZGVzY3JpcHRpb24sXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IG91Lm9yZ1VuaXRQYXRoLFxuICAgICAgICAgICAgICAgICAgICBpZDogb3Uub3JnVW5pdElkLFxuICAgICAgICAgICAgICAgICAgICBwYXJlbnRQYXRoOiBvdS5wYXJlbnRPcmdVbml0UGF0aCxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50SWQ6IG91LnBhcmVudE9yZ1VuaXRJZCxcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlZEF0OiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBkZWxldGVkQXQ6IG51bGwsXG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIHJldHVybiB1bml0O1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGF3YWl0IG5hbmdvLmJhdGNoU2F2ZTxPcmdhbml6YXRpb25hbFVuaXQ+KHVuaXRzLCAnT3JnYW5pemF0aW9uYWxVbml0Jyk7XG4gICAgICAgIH1cblxuICAgICAgICBwYWdlVG9rZW4gPSByZXNwb25zZS5kYXRhLm5leHRQYWdlVG9rZW47XG4gICAgfSB3aGlsZSAocGFnZVRva2VuKTtcblxuICAgIHJldHVybiB7XG4gICAgICAgIE9yZ2FuaXphdGlvbmFsVW5pdDogW11cbiAgICB9O1xufVxuIl19
