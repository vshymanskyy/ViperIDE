# (c) 2019 Paul Sokolovsky, MIT license
# This module is part of the Pycopy project, https://github.com/pfalcon/pycopy
from token import *
from collections import namedtuple
import io


COMMENT = N_TOKENS + 0
NL = N_TOKENS + 1
ENCODING = N_TOKENS + 2
tok_name[COMMENT] = "COMMENT"
tok_name[NL] = "NL"
tok_name[ENCODING] = "ENCODING"


class TokenInfo(namedtuple("TokenInfo", ("type", "string", "start", "end", "line"))):

    def __str__(self):
        return "TokenInfo(type=%d (%s), string=%r, startl=%d, line=%r)" % (
            self.type, tok_name[self.type], self.string, self.start, self.line
        )


def get_indent(l):
    for i in range(len(l)):
        if l[i] != " " and l[i] != "\t":
            return i, l[i:]


def get_str(l, readline):
    lineno = 0
    s = io.StringIO()

    if l.startswith('"""') or l.startswith("'''"):
        sep = l[0:3]
        s.write(sep)
        l = l[3:]
        pos = 0
        while True:
            i = l.find(sep, pos)
            if i >= 0:
                if i > 0 and l[i - 1] == "\\":
                    pos = i + 1
                    continue
                break
            s.write(l)
            l = readline()
            pos = 0
            assert l
            lineno += 1
        s.write(l[:i + 3])
        return s.getvalue(), l[i + 3:], lineno

    lbuf = io.StringIO(l)
    sep = lbuf.read(1)
    s.write(sep)
    while True:
        c = lbuf.read(1)
        if not c:
            break
        s.write(c)
        if c == "\\":
            c = lbuf.read(1)
            s.write(c)
            if c == "\n":
                lbuf = io.StringIO(readline())
                lineno += 1
                continue
        elif c == sep:
            break
    return s.getvalue(), lbuf.read(), lineno


def generate_tokens(readline):

    indent_stack = [0]
    lineno = 0
    paren_level = 0
    no_newline = False

    # generate_tokens() doesn't yield this, only tokenine() does.
    #yield TokenInfo(ENCODING, "utf-8", 0, 0, "")

    while True:
        l = readline()
        lineno += 1
        org_l = l
        if not l:
            break
        if not l.endswith("\n"):
            l += "\n"
            no_newline = True
        i, l = get_indent(l)

        if l == "\n":
            yield TokenInfo(NL, l, lineno, 0, org_l)
            continue
        elif l == "\x0c\n":
            yield TokenInfo(NL, "\n", lineno, 0, org_l)
            continue

        if l.startswith("#"):
            yield TokenInfo(COMMENT, l.rstrip("\n"), lineno, 0, org_l)
            yield TokenInfo(NL, "\n", lineno, 0, org_l)
            continue

        if paren_level == 0:
            if i > indent_stack[-1]:
                yield TokenInfo(INDENT, org_l[:i], lineno, 0, org_l)
                indent_stack.append(i)
            elif i < indent_stack[-1]:
                while i != indent_stack[-1]:
                    yield TokenInfo(DEDENT, "", lineno, 0, org_l)
                    indent_stack.pop()

        while l:
            if l[0].isdigit() or (l.startswith(".") and len(l) > 1 and l[1].isdigit()):
                seen_dot = False
                t = ""
                if l.startswith("0x") or l.startswith("0X"):
                    t = "0x"
                    l = l[2:]
                elif l.startswith("0o") or l.startswith("0O"):
                    t = "0o"
                    l = l[2:]
                elif l.startswith("0b") or l.startswith("0B"):
                    t = "0b"
                    l = l[2:]
                while l and (l[0].isdigit() or l[0] == "." or l[0] == "_" or (t.startswith("0x") and l[0] in "ABCDEFabcdef")):
                    if l[0] == ".":
                        if seen_dot:
                            break
                        seen_dot = True
                    t += l[0]
                    l = l[1:]
                if l.startswith("e") or l.startswith("E"):
                    t += l[0]
                    l = l[1:]
                    if l[0] in ("+", "-"):
                        t += l[0]
                        l = l[1:]
                    while l and (l[0].isdigit() or l[0] == "_"):
                        t += l[0]
                        l = l[1:]
                if l.startswith("j"):
                    t += l[0]
                    l = l[1:]
                yield TokenInfo(NUMBER, t, lineno, 0, org_l)
            elif l[0].isalpha() or l.startswith("_") or ord(l[0]) >= 0xaa:
                name = ""
                while l and (l[0].isalpha() or l[0].isdigit() or l.startswith("_") or ord(l[0]) >= 0xaa):
                    name += l[0]
                    l = l[1:]
                if (l.startswith('"') or l.startswith("'")) and name in ("b", "r", "rb", "br", "u", "f"):
                    s, l, lineno_delta = get_str(l, readline)
                    yield TokenInfo(STRING, name + s, lineno, 0, org_l)
                    lineno += lineno_delta
                else:
                    yield TokenInfo(NAME, name, lineno, 0, org_l)
            elif l == "\\\n":
                l = readline()
                lineno += 1
            elif l[0] == "\n":
                nl = "" if no_newline else "\n"
                if paren_level > 0:
                    yield TokenInfo(NL, nl, lineno, 0, org_l)
                else:
                    yield TokenInfo(NEWLINE, nl, lineno, 0, org_l)
                break
            elif l[0].isspace():
                l = l[1:]
            elif l.startswith('"') or l.startswith("'"):
                s, l, lineno_delta = get_str(l, readline)
                yield TokenInfo(STRING, s, lineno, 0, org_l)
                lineno += lineno_delta
            elif l.startswith("#"):
                yield TokenInfo(COMMENT, l.rstrip("\n"), lineno, 0, org_l)
                l = "\n"
            else:
                for op in (
                    "**=", "//=", ">>=", "<<=", "+=", "-=", "*=", "/=",
                    "%=", "@=", "&=", "|=", "^=", "**", "//", "<<", ">>",
                    "==", "!=", ">=", "<=", "...", "->"
                ):
                    if l.startswith(op):
                        yield TokenInfo(OP, op, lineno, 0, org_l)
                        l = l[len(op):]
                        break
                else:
                    yield TokenInfo(OP, l[0], lineno, 0, org_l)
                    if l[0] in ("(", "[", "{"):
                        paren_level += 1
                    elif l[0] in (")", "]", "}"):
                        paren_level -= 1
                    l = l[1:]

    while indent_stack[-1] > 0:
        yield TokenInfo(DEDENT, "", lineno, 0, "")
        indent_stack.pop()

    yield TokenInfo(ENDMARKER, "", lineno, 0, "")
