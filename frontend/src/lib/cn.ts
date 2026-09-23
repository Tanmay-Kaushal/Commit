// Tiny join-truthy-classnames helper — avoids pulling in the clsx package
// for something this small.
export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}
