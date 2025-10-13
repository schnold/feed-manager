export type Filter = {
  scope: string;
  field: string;
  operator: string;
  value?: string | null;
  group: number;
};

function getValueByPath(obj: any, path: string) {
  return path.split(".").reduce((acc, k) => (acc ? acc[k] : undefined), obj);
}

function evalOperator(actual: any, operator: string, expected: any): boolean {
  switch (operator) {
    case "equals":
      return `${actual}` === `${expected}`;
    case "not_equals":
      return `${actual}` !== `${expected}`;
    case "contains":
      return Array.isArray(actual) ? actual.includes(expected) : `${actual}`.includes(`${expected}`);
    case "gt":
      return Number(actual) > Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    case "exists":
      return actual !== undefined && actual !== null && `${actual}` !== "";
    case "in":
      return `${expected}`.split(",").map((s) => s.trim()).includes(`${actual}`);
    case "not_in":
      return !`${expected}`.split(",").map((s) => s.trim()).includes(`${actual}`);
    default:
      return true;
  }
}

export function passesFilters(product: any, variant: any, filters: Filter[], mode: "all" | "any" = "all") {
  if (!filters || filters.length === 0) return true;
  const results = filters.map((f) => {
    const subject = f.scope === "variant" ? variant : product;
    const actual = getValueByPath(subject, f.field);
    return evalOperator(actual, f.operator, f.value);
  });
  return mode === "all" ? results.every(Boolean) : results.some(Boolean);
}


