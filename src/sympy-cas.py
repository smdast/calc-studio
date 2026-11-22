import ast
import json
import math

import sympy as sp
from sympy.printing.str import StrPrinter


_CONSTANTS = {"pi": sp.pi, "e": sp.E, "i": sp.I}
_FUNCTIONS = {
    "sqrt": sp.sqrt, "cbrt": sp.cbrt, "log10": lambda x: sp.log(x, 10),
    "log2": lambda x: sp.log(x, 2), "ceil": sp.ceiling, "abs": sp.Abs,
    "round": lambda x: sp.floor(x + sp.S.Half),
    "factor": sp.factor, "Piecewise": sp.Piecewise,
    "Eq": sp.Eq, "Ne": sp.Ne, "And": sp.And, "Or": sp.Or,
}


class _AnswerPrinter(StrPrinter):
    def _print_Exp1(self, _expression):
        return "e"

    def _print_ImaginaryUnit(self, _expression):
        return "i"


def _read(source, symbols, answer=None):
    """Construct mathematical objects from a restricted expression grammar."""
    source = source.replace("^", "**")

    def visit(node):
        if isinstance(node, ast.Constant):
            if isinstance(node.value, bool):
                return sp.S.true if node.value else sp.S.false
            if isinstance(node.value, int):
                return sp.Integer(node.value)
            if isinstance(node.value, float):
                return sp.Rational(ast.get_source_segment(source, node))
        if isinstance(node, ast.Name):
            if node.id == "CalculatorAnswer" and answer is not None:
                return answer
            if node.id in _CONSTANTS:
                return _CONSTANTS[node.id]
            if node.id in {"oo", "zoo", "nan"}:
                return getattr(sp, node.id)
            return symbols.setdefault(node.id, sp.Symbol(node.id))
        if isinstance(node, ast.UnaryOp):
            if isinstance(node.op, ast.UAdd):
                return visit(node.operand)
            if isinstance(node.op, ast.USub):
                return -visit(node.operand)
        if isinstance(node, ast.BinOp):
            a, b = visit(node.left), visit(node.right)
            if isinstance(node.op, ast.Add):
                return a + b
            if isinstance(node.op, ast.Sub):
                return a - b
            if isinstance(node.op, ast.Mult):
                return a * b
            if isinstance(node.op, ast.Div):
                return a / b
            if isinstance(node.op, ast.Pow):
                return a ** b
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and not node.keywords:
            name = node.func.id
            fn = _FUNCTIONS.get(name)
            if fn is None:
                candidate = getattr(sp, name, None)
                if isinstance(candidate, type) and issubclass(candidate, sp.Function):
                    fn = candidate
            if fn is not None:
                return fn(*(visit(argument) for argument in node.args))
        if isinstance(node, ast.Compare) and len(node.ops) == 1:
            relation = {ast.Lt: sp.Lt, ast.LtE: sp.Le, ast.Gt: sp.Gt, ast.GtE: sp.Ge,
                        ast.Eq: sp.Eq, ast.NotEq: sp.Ne}.get(type(node.ops[0]))
            if relation is not None:
                return relation(visit(node.left), visit(node.comparators[0]))
        if isinstance(node, ast.Tuple):
            return tuple(visit(item) for item in node.elts)
        raise ValueError("Unsupported mathematical expression")

    return visit(ast.parse(source, mode="eval").body)


def _describe(value, symbols, arbitrary_constant=False):
    if value.has(sp.Integral, sp.Float, sp.zoo, sp.nan) or value in (sp.oo, -sp.oo):
        return None
    if arbitrary_constant:
        name, index = "C", 1
        while name in symbols or any(s.name == name for s in value.free_symbols):
            name = f"C_{index}"
            index += 1
        value += sp.Symbol(name)
    expression = _AnswerPrinter().doprint(value)
    if len(expression) > 6000:
        return None
    latex = sp.latex(value).replace(r"\log{", r"\ln{")
    numeric = None
    if not value.free_symbols:
        try:
            number = complex(value.evalf(16))
            if math.isfinite(number.real) and math.isfinite(number.imag):
                numeric = [number.real, number.imag]
        except (TypeError, ValueError, OverflowError):
            pass
    return {"latex": latex, "expression": expression, "numeric": numeric}


def evaluate_request(payload):
    request = json.loads(payload)
    operation = request["operation"]
    name = request.get("variable")
    variable = sp.Symbol(name, real=True) if name else None
    symbols = {name: variable} if name else {}
    prior_answer = _read(request["answer"], symbols) if request.get("answer") else None
    f = _read(request["source"], symbols, prior_answer)
    if operation == "integrate":
        bounds = request.get("bounds")
        if bounds is None:
            return _describe(sp.integrate(f, variable), symbols, arbitrary_constant=True)
        a, b = (_read(bound, symbols, prior_answer) for bound in bounds)
        return _describe(sp.integrate(f, (variable, a, b)), symbols)
    if operation == "differentiate":
        return _describe(sp.diff(f, variable), symbols)
    if operation == "solve":
        roots = sp.solve(f, variable)
        if not isinstance(roots, list) or not roots:
            return None
        equations = tuple(sp.Eq(variable, root) for root in roots)
        return _describe(equations[0] if len(equations) == 1 else sp.Tuple(*equations), symbols)
    if operation == "expand":
        return _describe(sp.expand(f), symbols)
    if operation == "factor":
        return _describe(sp.factor(f), symbols)
    return _describe(sp.simplify(f), symbols)
