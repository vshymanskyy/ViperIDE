class AST:

    def __init__(self, **fields):
        for k, v in fields.items():
            setattr(self, k, v)


class mod(AST): pass
class Module(mod):
    _fields = ('body',)
class Interactive(mod):
    _fields = ('body',)
class Expression(mod):
    _fields = ('body',)
class Suite(mod):
    _fields = ('body',)
class stmt(AST): pass
class FunctionDef(stmt):
    _fields = ('name', 'args', 'body', 'decorator_list', 'returns')
class AsyncFunctionDef(stmt):
    _fields = ('name', 'args', 'body', 'decorator_list', 'returns')
class ClassDef(stmt):
    _fields = ('name', 'bases', 'keywords', 'body', 'decorator_list')
class Return(stmt):
    _fields = ('value',)
class Delete(stmt):
    _fields = ('targets',)
class Assign(stmt):
    _fields = ('targets', 'value')
class AugAssign(stmt):
    _fields = ('target', 'op', 'value')
class AnnAssign(stmt):
    _fields = ('target', 'annotation', 'value', 'simple')
class For(stmt):
    _fields = ('target', 'iter', 'body', 'orelse')
class AsyncFor(stmt):
    _fields = ('target', 'iter', 'body', 'orelse')
class While(stmt):
    _fields = ('test', 'body', 'orelse')
class If(stmt):
    _fields = ('test', 'body', 'orelse')
class With(stmt):
    _fields = ('items', 'body')
class AsyncWith(stmt):
    _fields = ('items', 'body')
class Raise(stmt):
    _fields = ('exc', 'cause')
class Try(stmt):
    _fields = ('body', 'handlers', 'orelse', 'finalbody')
class Assert(stmt):
    _fields = ('test', 'msg')
class Import(stmt):
    _fields = ('names',)
class ImportFrom(stmt):
    _fields = ('module', 'names', 'level')
class Global(stmt):
    _fields = ('names',)
class Nonlocal(stmt):
    _fields = ('names',)
class Expr(stmt):
    _fields = ('value',)
class Pass(stmt):
    _fields = ()
class Break(stmt):
    _fields = ()
class Continue(stmt):
    _fields = ()
class expr(AST): pass
class BoolOp(expr):
    _fields = ('op', 'values')
class BinOp(expr):
    _fields = ('left', 'op', 'right')
class UnaryOp(expr):
    _fields = ('op', 'operand')
class Lambda(expr):
    _fields = ('args', 'body')
class IfExp(expr):
    _fields = ('test', 'body', 'orelse')
class Dict(expr):
    _fields = ('keys', 'values')
class Set(expr):
    _fields = ('elts',)
class ListComp(expr):
    _fields = ('elt', 'generators')
class SetComp(expr):
    _fields = ('elt', 'generators')
class DictComp(expr):
    _fields = ('key', 'value', 'generators')
class GeneratorExp(expr):
    _fields = ('elt', 'generators')
class Await(expr):
    _fields = ('value',)
class Yield(expr):
    _fields = ('value',)
class YieldFrom(expr):
    _fields = ('value',)
class Compare(expr):
    _fields = ('left', 'ops', 'comparators')
class Call(expr):
    _fields = ('func', 'args', 'keywords')
class Num(expr):
    _fields = ('n',)
    def __init__(self, n):
        self.n = n
class Str(expr):
    _fields = ('s',)
class FormattedValue(expr):
    _fields = ('value', 'conversion', 'format_spec')
class JoinedStr(expr):
    _fields = ('values',)
class Bytes(expr):
    _fields = ('s',)
class NameConstant(expr):
    _fields = ('value',)
class Ellipsis(expr):
    _fields = ()
class Constant(expr):
    _fields = ('value',)
class Attribute(expr):
    _fields = ('value', 'attr', 'ctx')
class Subscript(expr):
    _fields = ('value', 'slice', 'ctx')
class Starred(expr):
    _fields = ('value', 'ctx')
class Name(expr):
    _fields = ('id', 'ctx')
class List(expr):
    _fields = ('elts', 'ctx')
class Tuple(expr):
    _fields = ('elts', 'ctx')
class expr_context(AST): pass
class Load(expr_context):
    _fields = ()
class Store(expr_context):
    _fields = ()
class StoreConst(expr_context):
    _fields = ()
class Del(expr_context):
    _fields = ()
class AugLoad(expr_context):
    _fields = ()
class AugStore(expr_context):
    _fields = ()
class Param(expr_context):
    _fields = ()
class slice(AST): pass
class Slice(slice):
    _fields = ('lower', 'upper', 'step')
class ExtSlice(slice):
    _fields = ('dims',)
class Index(slice):
    _fields = ('value',)
class boolop(AST): pass
class And(boolop):
    _fields = ()
class Or(boolop):
    _fields = ()
class operator(AST): pass
class Add(operator):
    _fields = ()
class Sub(operator):
    _fields = ()
class Mult(operator):
    _fields = ()
class MatMult(operator):
    _fields = ()
class Div(operator):
    _fields = ()
class Mod(operator):
    _fields = ()
class Pow(operator):
    _fields = ()
class LShift(operator):
    _fields = ()
class RShift(operator):
    _fields = ()
class BitOr(operator):
    _fields = ()
class BitXor(operator):
    _fields = ()
class BitAnd(operator):
    _fields = ()
class FloorDiv(operator):
    _fields = ()
class unaryop(AST): pass
class Invert(unaryop):
    _fields = ()
class Not(unaryop):
    _fields = ()
class UAdd(unaryop):
    _fields = ()
class USub(unaryop):
    _fields = ()
class cmpop(AST): pass
class Eq(cmpop):
    _fields = ()
class NotEq(cmpop):
    _fields = ()
class Lt(cmpop):
    _fields = ()
class LtE(cmpop):
    _fields = ()
class Gt(cmpop):
    _fields = ()
class GtE(cmpop):
    _fields = ()
class Is(cmpop):
    _fields = ()
class IsNot(cmpop):
    _fields = ()
class In(cmpop):
    _fields = ()
class NotIn(cmpop):
    _fields = ()
class comprehension(AST):
    _fields = ('target', 'iter', 'ifs', 'is_async')
class excepthandler(AST): pass
class ExceptHandler(excepthandler):
    _fields = ('type', 'name', 'body')
class arguments(AST):
    _fields = ('args', 'vararg', 'kwonlyargs', 'kw_defaults', 'kwarg', 'defaults')
class arg(AST):
    _fields = ('arg', 'annotation')
class keyword(AST):
    _fields = ('arg', 'value')
class alias(AST):
    _fields = ('name', 'asname')
class withitem(AST):
    _fields = ('context_expr', 'optional_vars')
