# Python to AST parser module
# This module is part of Pycopy https://github.com/pfalcon/pycopy
# and pycopy-lib https://github.com/pfalcon/pycopy-lib projects.
#
# Copyright (c) 2019, 2020 Paul Sokolovsky
#
# The MIT License
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.

import sys
import logging
from utokenize import *
from . import types as ast


log = logging.Logger(__name__)


TOK_TYPE = 0
TOK_STRING = 1

BP_UNTIL_COMMA = 6
BP_LVALUE = 160 - 1


class GenComp(ast.expr):
    _fields = ('elt', 'generators')


def literal_eval(s):
    if s.endswith('"') or s.endswith("'"):
        if s.endswith('"""') or s.endswith("'''"):
            sep = s[-3:]
        else:
            sep = s[-1]
        prefix, s = s.split(sep, 1)
        s = s[:-len(sep)]
        is_bytes = "b" in prefix
        if "r" in prefix:
            res = s
            if is_bytes:
                res = bytes(res, "utf-8")
        else:
            if is_bytes:
                res = b""
            else:
                res = ""
            while s:
                if s[0] == "\\":
                    c = s[1]
                    if c >= "0" and c <= "7":
                        s = s[1:]
                        ns = ""
                        while s and s[0] >= "0" and s[0] <= "7" and len(ns) < 3:
                            ns += s[0]
                            s = s[1:]
                        if is_bytes:
                            nc = bytes([int(ns, 8)])
                        else:
                            nc = chr(int(ns, 8))
                    elif c == "x":
                        if is_bytes:
                            nc = bytes([int(s[2:4], 16)])
                        else:
                            nc = chr(int(s[2:4], 16))
                        s = s[4:]
                    elif c == "u" and not is_bytes:
                        nc = chr(int(s[2:6], 16))
                        s = s[6:]
                    elif c == "U" and not is_bytes:
                        nc = chr(int(s[2:10], 16))
                        s = s[10:]
                    else:
                        nc = {
                            "a": "\a", "b": "\b", "f": "\f", "n": "\n", "r": "\r",
                            "t": "\t", "v": "\v", "\\": "\\", "'": "'", '"': '"',
                            "\n": "",
                        }.get(c)
                        if nc is None:
                            nc = s[0:2]
                        s = s[2:]
                    if is_bytes and not isinstance(nc, bytes):
                        nc = nc.encode()
                    res += nc
                else:
                    if is_bytes:
                        res += s[0].encode()
                    else:
                        res += s[0]
                    s = s[1:]
        return res

    raise NotImplementedError


# Pratt parser token root base class
class TokBase:
    # Left denotation and null denotation binding powers, effectively,
    # operator precedence. As such, we use operator's row number
    # (starting from 1) in the precedence table at
    # https://docs.python.org/3.5/reference/expressions.html#operator-precedence
    # multiplied by 10. Note that not all operators are in that table,
    # and some may get precedence inbetween (including before 10).
    # For Pratt algorithm, only LBP needs to be set on each class
    # (which can be at "left arg available" position, i.e. infix or
    # postfix operators. NBP is mostly given as commented value for
    # documentation purposes (actual NBP is encoded as numeric value
    # in nud() method "for efficiency").
    lbp = 0
    #nbp = 0


# Token base classes

class TokDelim(TokBase):
    pass

class TokPrefix(TokBase):
    @classmethod
    def nud(cls, p, t):
        arg = p.expr(cls.nbp)
        node = ast.UnaryOp(op=cls.ast_un_op(), operand=arg)
        return node

class TokInfix(TokBase):
    @classmethod
    def led(cls, p, left, t):
        right = p.expr(cls.lbp)
        if cls.ast_bin_op in (ast.And, ast.Or) and isinstance(left, ast.BoolOp) and isinstance(left.op, cls.ast_bin_op) and not getattr(left, "parenform", False):
            left.values.append(right)
            return left
        node = cls.bin_op(cls.ast_bin_op, left, right)
        return node

    @staticmethod
    def bin_op(op, left, right):
        if op in (ast.And, ast.Or):
            return ast.BoolOp(op=op(), values=[left, right])
        elif issubclass(op, ast.cmpop):
            if isinstance(left, ast.Compare) and not getattr(left, "parenform", False):
                left.ops.append(op())
                left.comparators.append(right)
                return left
            return ast.Compare(ops=[op()], left=left, comparators=[right])
        else:
            return ast.BinOp(op=op(), left=left, right=right)

class TokInfixRAssoc(TokBase):
    @classmethod
    def led(cls, p, left, t):
        right = p.expr(cls.lbp - 1)
        node = ast.BinOp(op=cls.ast_bin_op(), left=left, right=right)
        return node

# Concrete tokens

class TokYield(TokBase):
    #nbp = 3
    @classmethod
    def nud(cls, p, t):
        yield_from = False
        if p.match("from"):
            yield_from = True
        value = p.match_expr(rbp=4)
        if yield_from:
            return ast.YieldFrom(value=value)
        else:
            return ast.Yield(value=value)

class TokComma(TokBase):
    lbp = 5
    # Tuple creation operator
    @classmethod
    def led(cls, p, left, t):
        elts = [left]
        while not p.is_delim():
            e = p.expr(5)
            elts.append(e)
            if not p.match(","):
                break
        node = ast.Tuple(elts=elts, ctx=ast.Load())
        return node

class TokFor(TokBase):
    lbp = 7
    @classmethod
    def led(cls, p, left, t):
        is_async = 0
        if t.string == "async":
            is_async = 1
            t = p.tok
            p.next()
            assert t.string == "for"
        target, expr = p.match_for_in(20)
        ifs = []
        while p.match("if"):
            ifs.append(p.expr(20))
        comp = ast.comprehension(target=target, iter=expr, ifs=ifs, is_async=is_async)
        if isinstance(left, GenComp):
            left.generators.append(comp)
            return left
        return GenComp(
            elt=left, generators=[comp]
        )

class TokLambda(TokBase):
    #nbp = 10
    @classmethod
    def nud(cls, p, t):
        arg_spec = p.require_typedargslist(True)
        p.expect(":")
        body = p.expr(10)
        node = ast.Lambda(args=arg_spec, body=body)
        return node

class TokIf(TokBase):
    lbp = 20
    @classmethod
    def led(cls, p, left, t):
        cond = p.expr(20)
        p.expect("else")
        orelse = p.expr(19)
        node = ast.IfExp(test=cond, body=left, orelse=orelse)
        return node

class TokOr(TokInfix):
    lbp = 30
    ast_bin_op = ast.Or

class TokAnd(TokInfix):
    lbp = 40
    ast_bin_op = ast.And

class TokNot(TokPrefix, TokInfix):
    nbp = 50
    ast_un_op = ast.Not

    lbp = 60  # not in
    ast_bin_op = ast.NotIn
    @classmethod
    def led(cls, p, left, t):
        p.expect("in")
        return super().led(p, left, t)

class TokEq(TokInfix):
    lbp = 60
    ast_bin_op = ast.Eq

class TokNotEq(TokInfix):
    lbp = 60
    ast_bin_op = ast.NotEq

class TokLt(TokInfix):
    lbp = 60
    ast_bin_op = ast.Lt

class TokGt(TokInfix):
    lbp = 60
    ast_bin_op = ast.Gt

class TokLtE(TokInfix):
    lbp = 60
    ast_bin_op = ast.LtE

class TokGtE(TokInfix):
    lbp = 60
    ast_bin_op = ast.GtE

class TokIs(TokInfix):
    lbp = 60
    # Overriden to handle both "is" and "is not"
    @classmethod
    def led(cls, p, left, t):
        op = ast.Is
        if p.match("not"):
            op = ast.IsNot
        right = p.expr(cls.lbp)
        node = cls.bin_op(op, left, right)
        return node

class TokIn(TokInfix):
    lbp = 60
    ast_bin_op = ast.In

class TokBinOr(TokInfix):
    lbp = 70
    ast_bin_op = ast.BitOr

class TokBinXor(TokInfix):
    lbp = 80
    ast_bin_op = ast.BitXor

class TokBinAnd(TokInfix):
    lbp = 90
    ast_bin_op = ast.BitAnd

class TokLShift(TokInfix):
    lbp = 100
    ast_bin_op = ast.LShift

class TokRShift(TokInfix):
    lbp = 100
    ast_bin_op = ast.RShift

class TokPlus(TokInfix, TokPrefix):
    lbp = 110
    ast_bin_op = ast.Add
    nbp = 130
    ast_un_op = ast.UAdd

class TokMinus(TokInfix, TokPrefix):
    lbp = 110
    ast_bin_op = ast.Sub
    nbp = 130
    ast_un_op = ast.USub

class TokMul(TokInfix):
    lbp = 120
    ast_bin_op = ast.Mult

    @classmethod
    def nud(cls, p, t):
        value = p.expr(160 - 1)
        return ast.Starred(value=value, ctx=ast.Load())

class TokMatMul(TokInfix):
    lbp = 120
    ast_bin_op = ast.MatMult

class TokDiv(TokInfix):
    lbp = 120
    ast_bin_op = ast.Div

class TokFloorDiv(TokInfix):
    lbp = 120
    ast_bin_op = ast.FloorDiv

class TokMod(TokInfix):
    lbp = 120
    ast_bin_op = ast.Mod

class TokInvert(TokPrefix):
    nbp = 130
    ast_un_op = ast.Invert

class TokPow(TokInfixRAssoc):
    lbp = 140
    ast_bin_op = ast.Pow

class TokAwait(TokPrefix):
    #nbp = 150
    @classmethod
    def nud(cls, p, t):
        value = p.expr(150)
        return ast.Await(value=value)

class TokDot(TokBase):
    lbp = 160
    @classmethod
    def led(cls, p, left, t):
        attr = p.expect(NAME)
        node = ast.Attribute(value=left, attr=attr, ctx=ast.Load())
        return node

class TokOpenSquare(TokBase):
    lbp = 160
    @classmethod
    def led(cls, p, left, t):
        dims = []
        rbp = 0
        while True:
            idx = p.match_expr(rbp=rbp)
            if p.match(":"):
                upper = p.match_expr(rbp=BP_UNTIL_COMMA)
                step = None
                if p.match(":"):
                    step = p.match_expr(rbp=BP_UNTIL_COMMA)
                slc = ast.Slice(lower=idx, upper=upper, step=step)
            else:
                slc = ast.Index(value=idx)
            dims.append(slc)
            if not p.match(","):
                break
            rbp = BP_UNTIL_COMMA
        p.expect("]")
        if len(dims) == 1:
            node = ast.Subscript(value=left, slice=slc, ctx=ast.Load())
        else:
            node = ast.Subscript(value=left, slice=ast.ExtSlice(dims=dims), ctx=ast.Load())
        return node

    @classmethod
    def nud(cls, p, t):
        elts = []
        while not p.match("]"):
            val = p.expr(BP_UNTIL_COMMA)
            if isinstance(val, GenComp):
                p.expect("]")
                return ast.ListComp(
                    elt=val.elt, generators=val.generators
                )

            elts.append(val)
            p.match(",")
        node = ast.List(elts=elts, ctx=ast.Load())
        return node

class TokOpenBrace(TokBase):
    @classmethod
    def nud(cls, p, t):
        keys = []
        vals = []
        # dict or set
        is_dict = None
        while not p.match("}"):
            if p.match("**"):
                is_dict = True
                v = p.expr(BP_UNTIL_COMMA)
                keys.append(None)
                vals.append(v)
                p.match(",")
                continue

            k = p.expr(BP_UNTIL_COMMA)
            if isinstance(k, GenComp):
                p.expect("}")
                return ast.SetComp(
                    elt=k.elt, generators=k.generators
                )

            keys.append(k)
            if is_dict is None:
                is_dict = bool(p.check(":"))
            if is_dict:
                p.expect(":")
                v = p.expr(BP_UNTIL_COMMA)
                if isinstance(v, GenComp):
                    p.expect("}")
                    return ast.DictComp(
                        key=k, value=v.elt, generators=v.generators
                    )

                vals.append(v)
            p.match(",")
        if is_dict or is_dict is None:
            node = ast.Dict(keys=keys, values=vals)
        else:
            node = ast.Set(elts=keys)
        return node

class TokOpenParens(TokBase):
    lbp = 160
    @classmethod
    def led(cls, p, left, t):
        args, keywords = p.match_call_args()
        node = ast.Call(func=left, args=args, keywords=keywords)
        return node

    #nbp = 170
    @classmethod
    def nud(cls, p, t):
        if p.match(")"):
            # Empty tuple
            return ast.Tuple(elts=[], ctx=ast.Load())
        e = p.expr()
        p.expect(")")
        e.parenform = True
        if isinstance(e, GenComp):
            return ast.GeneratorExp(elt=e.elt, generators=e.generators)
        return e

class TokNumber(TokBase):
    @classmethod
    def nud(cls, p, t):
        try:
            v = int(t.string, 0)
        except ValueError:
            if t.string.endswith("j"):
                v = complex(t.string)
            else:
                v = float(t.string)
        node = ast.Num(n=v)
        return node

class TokString(TokBase):
    lbp = 200
    # Adjacent strings
    @classmethod
    def led(cls, p, left, t):
        assert isinstance(left, (ast.Str, ast.Bytes))
        left.s += literal_eval(t.string)
        return left

    @classmethod
    def nud(cls, p, t):
        v = literal_eval(t.string)
        if isinstance(v, bytes):
            return ast.Bytes(s=v)
        else:
            return ast.Str(s=v)

class TokName(TokBase):
    @classmethod
    def nud(cls, p, t):
        return ast.Name(id=t[TOK_STRING], ctx=ast.Load())

class TokConst(TokBase):
    @classmethod
    def nud(cls, p, t):
        return ast.NameConstant(value=cls.value)

class TokNone(TokConst):
    value = None
class TokTrue(TokConst):
    value = True
class TokFalse(TokConst):
    value = False

class TokEllipsis(TokBase):
    @classmethod
    def nud(cls, p, t):
        return ast.Ellipsis()


pratt_token_map = {
    NEWLINE: TokDelim,
    "=": TokDelim,
    ",": TokComma,
    "yield": TokYield,
    "for": TokFor,
    "async": TokFor,
    "lambda": TokLambda,
    "if": TokIf, "else": TokDelim,
    "or": TokOr,
    "and": TokAnd,
    "not": TokNot,
    "==": TokEq,
    "!=": TokNotEq,
    "<": TokLt,
    "<=": TokLtE,
    ">": TokGt,
    ">=": TokGtE,
    "is": TokIs,
    "in": TokIn,
    "|": TokBinOr,
    "^": TokBinXor,
    "&": TokBinAnd,
    "<<": TokLShift,
    ">>": TokRShift,
    "+": TokPlus,
    "-": TokMinus,
    "*": TokMul,
    "@": TokMatMul,
    "/": TokDiv,
    "//": TokFloorDiv,
    "%": TokMod,
    "~": TokInvert,
    "**": TokPow,
    "await": TokAwait,
    ".": TokDot,
    "[": TokOpenSquare, "]": TokDelim,
    "{": TokOpenBrace, "}": TokDelim,
    "(": TokOpenParens, ")": TokDelim,
    "None": TokNone,
    "True": TokTrue,
    "False": TokFalse,
    "...": TokEllipsis,
    NUMBER: TokNumber,
    STRING: TokString,
}


class Parser:

    def __init__(self, token_stream):
        self.tstream = token_stream
        self.tok = None
        self.next()
        self.decorators = []

    def next(self):
        while True:
            self.tok = next(self.tstream)
            log.debug("next: %r", self.tok)
            if self.tok[TOK_TYPE] not in (COMMENT, NL):
                break

    def error(self, msg="syntax error"):
        sys.stderr.write("<input>:%d: error: %s\n" % (self.tok.start, msg))
        raise Exception

    # Recursively set "lvalue" node access context (to other value than
    # default ast.Load).
    @staticmethod
    def set_ctx(t, ctx):
        if isinstance(t, list):
            for e in t:
                Parser.set_ctx(e, ctx)
        elif isinstance(t, ast.AST):
            t.ctx = ctx
            if isinstance(t, ast.Subscript):
                return
            for k in t._fields:
                v = getattr(t, k, None)
                if not (isinstance(t, ast.Attribute) and k == "value"):
                    Parser.set_ctx(v, ctx)

    def check(self, what):
        if isinstance(what, str):
            if self.tok[TOK_STRING] == what and self.tok[TOK_TYPE] in (NAME, OP):
                return True
            return None

        if isinstance(what, int):
            if self.tok[TOK_TYPE] == what:
                if what == ENDMARKER:
                    return True
                res = self.tok[TOK_STRING]
                if res == "":
                    return True
                return res
            return None

        assert False, "Unknown value type to match"

    def match(self, what):
        res = self.check(what)
        if res and what != ENDMARKER:
            self.next()
        return res

    def expect(self, what):
        res = self.match(what)
        if not res:
            if isinstance(what, int):
                self.error("expected %s" % tok_name[what])
            else:
                self.error("expected '%s'" % what)
        return res

    def is_end_of_stmt(self):
        return self.check(NEWLINE) or self.check(";") or self.check(ENDMARKER)

    def is_delim(self):
        if self.is_end_of_stmt():
            return True
        if self.tok[TOK_TYPE] == OP and self.tok[TOK_STRING] in ("]", "}", ")", ":", "="):
            return True

    @staticmethod
    def make_name(id, ctx=None):
        node = ast.Name(id=id)
        if ctx:
            node.ctx = ctx()
        return node

    def match_funcdef(self, is_async=False):
        lineno = self.tok.start
        if not self.match("def"):
            return
        name = self.expect(NAME)
        self.expect("(")
        arg_spec = self.require_typedargslist()
        self.expect(")")

        returns = None
        if self.match("->"):
            returns = self.require_expr()

        self.expect(":")
        decorator_list = self.decorators
        self.decorators = []
        body = self.match_suite()
        if is_async:
            asttype = ast.AsyncFunctionDef
        else:
            asttype = ast.FunctionDef
        node = asttype(
            name=name, args=arg_spec, body=body,
            decorator_list=decorator_list, returns=returns, lineno=lineno
        )
        return node

    def match_classdef(self):
        lineno = self.tok.start
        if not self.match("class"):
            return
        name = self.expect(NAME)
        bases = []
        keywords = []
        if self.match("("):
            bases, keywords = self.match_call_args()
        self.expect(":")
        decorator_list = self.decorators
        self.decorators = []
        body = self.match_suite()
        return ast.ClassDef(
            name=name, body=body, bases=bases, keywords=keywords,
            decorator_list=decorator_list, lineno=lineno
        )

    def match_stmt(self):
        while True:
            res = self.match_compound_stmt()
            # True means a decorator matched
            if res is not True:
                break
        if res:
            log.debug("match_stmt: %r", res)
            return [res]
        res = self.match_simple_stmt()
        if res: return res
        self.error("expected statement")

    def match_simple_stmt(self):
        res = self.match_small_stmt()
        if res is None:
            return None

        body = [res]
        while True:
            if not self.match(";"):
                break
            if self.check(NEWLINE):
                break
            res = self.match_small_stmt()
            if res is None:
                break
            body.append(res)
        self.expect(NEWLINE)
        return body

    def match_small_stmt(self):
        res = self.match_import_stmt()
        if res: return res

        if self.match("break"):
            return ast.Break()
        if self.match("continue"):
            return ast.Continue()
        if self.match("pass"):
            return ast.Pass()

        if self.match("return"):
            expr = self.match_expr()
            return ast.Return(value=expr)

        if self.match("raise"):
            expr = self.match_expr()
            cause = None
            if self.match("from"):
                cause = self.match_expr()
            return ast.Raise(exc=expr, cause=cause)

        if self.match("assert"):
            expr = self.match_expr(rbp=BP_UNTIL_COMMA)
            msg = None
            if self.match(","):
                msg = self.match_expr(rbp=BP_UNTIL_COMMA)
            return ast.Assert(test=expr, msg=msg)

        if self.match("del"):
            exprs = self.match_exprlist(ctx=ast.Del)
            return ast.Delete(targets=exprs)

        if self.match("global"):
            names = self.match_namelist()
            return ast.Global(names=names)
        if self.match("nonlocal"):
            names = self.match_namelist()
            return ast.Nonlocal(names=names)

        res = self.match_expr()
        if not res:
            return None

        ann = None
        if self.match(":"):
            ann = self.match_expr()

        if self.check("="):
            targets = []
            while self.match("="):
                self.set_ctx(res, ast.Store())
                targets.append(res)
                res = self.match_expr()
            if ann is None:
                return ast.Assign(targets=targets, value=res)
            else:
                assert len(targets) == 1
                return ast.AnnAssign(target=targets[0], annotation=ann, value=res, simple=1)

        elif self.check(OP) and self.tok.string.endswith("="):
            self.set_ctx(res, ast.Store())
            op_type = {
                "+=": ast.Add, "-=": ast.Sub, "*=": ast.Mult, "/=": ast.Div,
                "//=": ast.FloorDiv, "%=": ast.Mod, "**=": ast.Pow,
                "@=": ast.MatMult, "|=": ast.BitOr, "^=": ast.BitXor,
                "&=": ast.BitAnd, "<<=": ast.LShift, ">>=": ast.RShift,
            }[self.tok.string]
            self.next()
            val = self.match_expr()
            return ast.AugAssign(target=res, op=op_type(), value=val)

        if ann is None:
            return ast.Expr(value=res)
        else:
            self.set_ctx(res, ast.Store())
            return ast.AnnAssign(target=res, annotation=ann, value=None, simple=1)

    def match_compound_stmt(self):
        if self.match("@"):
            decor = self.match_expr(rbp=BP_LVALUE)
            self.expect(NEWLINE)
            self.decorators.append(decor)
            return True

        is_async = False
        if self.match("async"):
            is_async = True

        res = self.match_funcdef(is_async)
        if res: return res
        res = self.match_for_stmt(is_async)
        if res: return res
        res = self.match_with_stmt(is_async)
        if res: return res

        if is_async:
            self.error("Unexpected async keyword")

        res = self.match_classdef()
        if res: return res

        if self.decorators:
            self.error("Unexpected decorator")

        res = self.match_if_stmt()
        if res: return res
        res = self.match_while_stmt()
        if res: return res
        res = self.match_try_stmt()
        if res: return res
        return None

    def match_suite(self):
        if self.match(NEWLINE):
            self.expect(INDENT)
            body = []
            while self.match(DEDENT) is None:
                body.extend(self.match_stmt())
            return body
        else:
            return self.match_simple_stmt()

    def match_import_stmt(self):
        if self.match("import"):
            names = []
            while True:
                name = self.match_dotted_name()
                asname = None
                if self.match("as"):
                    asname = self.expect(NAME)
                names.append(ast.alias(name=name, asname=asname))
                if not self.match(","):
                    break
            return ast.Import(names=names)
        elif self.match("from"):
            level = 0
            while True:
                if self.match("."):
                    level += 1
                # "..." is a single token (ellipsis)
                elif self.match("..."):
                    level += 3
                else:
                    break
            module = None
            if not self.check("import"):
                module = self.match_dotted_name()
            self.expect("import")
            names = []
            if self.match("*"):
                name = "*"
                names.append(ast.alias(name="*", asname=None))
            else:
                is_paren = self.match("(")
                while True:
                    name = self.expect(NAME)
                    asname = None
                    if self.match("as"):
                        asname = self.expect(NAME)
                    names.append(ast.alias(name=name, asname=asname))
                    if not self.match(","):
                        break
                    if self.check(")"):
                        break
                if is_paren:
                    self.match(")")
            return ast.ImportFrom(module=module, names=names, level=level)

    def match_if_stmt(self):

        def handle_if():
            expr = self.require_expr()
            self.expect(":")
            body = self.match_suite()
            orelse = []

            if self.match("elif"):
                orelse = [handle_if()]

            elif self.match("else"):
                self.expect(":")
                orelse = self.match_suite()

            return ast.If(test=expr, body=body, orelse=orelse)

        if self.match("if"):
            return handle_if()

    def match_for_in(self, rbp=0):
        target = self.match_expr(ctx=ast.Store, rbp=BP_LVALUE)
        if self.check(","):
            target = ast.Tuple(elts=[target], ctx=ast.Store())
            while self.match(","):
                if self.check("in"):
                    break
                target.elts.append(self.match_expr(ctx=ast.Store, rbp=BP_LVALUE))
        self.expect("in")
        expr = self.require_expr(rbp=rbp)
        return target, expr

    def match_for_stmt(self, is_async=False):
        if not self.match("for"):
            return None
        target, expr = self.match_for_in()
        self.expect(":")
        body = self.match_suite()
        orelse = []
        if self.match("else"):
            self.expect(":")
            orelse = self.match_suite()
        if is_async:
            asttype = ast.AsyncFor
        else:
            asttype = ast.For
        return asttype(target=target, iter=expr, body=body, orelse=orelse)

    def match_while_stmt(self):
        if not self.match("while"):
            return None
        expr = self.require_expr()
        self.expect(":")
        body = self.match_suite()
        orelse = []
        if self.match("else"):
            self.expect(":")
            orelse = self.match_suite()
        return ast.While(test=expr, body=body, orelse=orelse)

    def match_with_stmt(self, is_async=False):
        if not self.match("with"):
            return None
        items = []
        while True:
            expr = self.require_expr(rbp=BP_UNTIL_COMMA)
            asname = None
            if self.match("as"):
                asname = self.match_expr(rbp=BP_UNTIL_COMMA)
                self.set_ctx(asname, ast.Store())
            items.append(ast.withitem(context_expr=expr, optional_vars=asname))
            if not self.match(","):
                break
        self.expect(":")
        body = self.match_suite()
        if is_async:
            asttype = ast.AsyncWith
        else:
            asttype = ast.With
        return asttype(items=items, body=body)

    def match_try_stmt(self):
        if not self.match("try"):
            return None
        self.expect(":")
        body = self.match_suite()

        handlers = []
        while self.match("except"):
            exc_sel = None
            capture_var = None
            if not self.match(":"):
                exc_sel = self.require_expr()
                if self.match("as"):
                    capture_var = self.expect(NAME)
                self.expect(":")
            exc_body = self.match_suite()
            handlers.append(ast.ExceptHandler(type=exc_sel, name=capture_var, body=exc_body))

        orelse = []
        if self.match("else"):
            self.expect(":")
            orelse = self.match_suite()

        finalbody = []
        if self.match("finally"):
            self.expect(":")
            finalbody = self.match_suite()

        return ast.Try(body=body, handlers=handlers, orelse=orelse, finalbody=finalbody)


    @staticmethod
    def get_token_class(t):
        cls = pratt_token_map.get(t[TOK_TYPE])
        if cls:
            return cls
        cls = pratt_token_map.get(t[TOK_STRING])
        if cls:
            return cls
        return TokName

    def expr(self, rbp=0):
        t = self.tok
        self.next()
        cls_nud = self.get_token_class(t)
        left = cls_nud.nud(self, t)
        t = self.tok
        cls_led = self.get_token_class(t)
        while rbp < cls_led.lbp:
            self.next()
            left = cls_led.led(self, left, t)
            t = self.tok
            cls_led = self.get_token_class(t)
        return left

    def match_expr(self, ctx=None, rbp=0):
        # Adhoc, consider making suitable TokDelim.nud() return None
        if self.is_delim():
            return None
        if rbp >= BP_UNTIL_COMMA and self.check(","):
            return None

        n = self.expr(rbp)
        if ctx:
            self.set_ctx(n, ctx())
        return n

    def require_expr(self, ctx=None, rbp=0):
        res = self.match_expr(ctx, rbp)
        if res is not None: return res
        self.error("expected expression")

    def match_exprlist(self, ctx=None):
        res = []
        while True:
            expr = self.match_expr(ctx, rbp=BP_UNTIL_COMMA)
            if not expr:
                break
            res.append(expr)
            if not self.match(","):
                break
        assert res
        return res

    def match_namelist(self):
        res = []
        while True:
            name = self.expect(NAME)
            res.append(name)
            if not self.match(","):
                break
        return res

    def require_typedargslist(self, is_lambda=False):
        args = []
        defaults = []
        kwonlyargs = []
        kw_defaults = []
        vararg = None
        kwarg = None
        kwonly = False
        # TODO: This is somewhat adhoc, relies on terminating token for funcdef vs lambda
        while not self.check(")") and not self.check(":"):
            if self.match("*"):
                kwonly = True
                if self.match(","):
                    continue
                if vararg:
                    self.error(">1 vararg")
                vararg = True
            elif self.match("**"):
                if kwarg:
                    self.error(">1 kwarg")
                kwarg = True
            arg = self.expect(NAME)
            arg = ast.arg(arg=arg, annotation=None)
            if not is_lambda and self.match(":"):
                arg.annotation = self.require_expr(rbp=BP_UNTIL_COMMA)

            if vararg is True:
                vararg = arg
                self.match(",")
                continue
            elif kwarg is True:
                kwarg = arg
                self.match(",")
                continue
            if kwonly:
                kwonlyargs.append(arg)
            else:
                args.append(arg)
            if self.match("="):
                dflt = self.require_expr(rbp=BP_UNTIL_COMMA)
                if kwonly:
                    kw_defaults.append(dflt)
                else:
                    defaults.append(dflt)
            elif kwonly:
                kw_defaults.append(None)
            self.match(",")

        arg_spec = ast.arguments(
            args=args, vararg=vararg,
            kwonlyargs=kwonlyargs, kw_defaults=kw_defaults,
            kwarg=kwarg, defaults=defaults
        )
        return arg_spec

    def match_call_args(self):
        args = []
        keywords = []
        if not self.check(")"):
            while True:
                starred = None
                if self.match("*"):
                    starred = "*"
                elif self.match("**"):
                    starred = "**"
                arg = self.expr(BP_UNTIL_COMMA)
                if isinstance(arg, GenComp):
                    arg = ast.GeneratorExp(elt=arg.elt, generators=arg.generators)
                if self.match("="):
                    assert isinstance(arg, ast.Name)
                    val = self.expr(BP_UNTIL_COMMA)
                    keywords.append(ast.keyword(arg=arg.id, value=val))
                else:
                    if starred == "**":
                        keywords.append(ast.keyword(arg=None, value=arg))
                    else:
                        if starred == "*":
                            arg = ast.Starred(value=arg, ctx=ast.Load())
                        args.append(arg)
                self.match(",")
                if self.check(")"):
                    break
        self.expect(")")
        return args, keywords

    def match_dotted_name(self):
        name = self.match(NAME)
        if name is None:
            return None
        while self.match("."):
            name += "." + self.expect(NAME)
        return name

    def match_mod(self):
        body = []
        while not self.match(ENDMARKER):
            stmt = self.match_stmt()
            body.extend(stmt)
        return ast.Module(body=body)
