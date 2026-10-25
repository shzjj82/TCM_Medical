/**
 * 极简 YAML 子集解析器。
 *
 * 为什么不用 yaml 包：为了保持 agents 运行时零第三方依赖，Skill 清单可以随仓库
 * 直接分发、无需 install。支持的语法范围限定在我们自己写的 skill.yaml：
 *   - `key: value` / `key:` 后接嵌套
 *   - 列表 `- 标量` 与 `- key: value` 后接缩进 map
 *   - `#` 行注释
 * 不支持：锚点、多行块(| >)、复杂内联 map/flow。
 */
export type YamlValue = string | YamlValue[] | { [key: string]: YamlValue };

interface Line {
  indent: number;
  text: string;
}

function parseLines(src: string): Line[] {
  return src
    .split(/\r?\n/)
    .map((raw) => raw.replace(/\s+$/, ''))
    .filter((raw) => raw.trim() !== '' && !raw.trim().startsWith('#'))
    .map((raw) => ({ indent: raw.length - raw.replace(/^\s+/, '').length, text: raw.trim() }));
}

function scalar(value: string): YamlValue {
  const trimmed = value.replace(/\s+#.*$/, '').trim();
  if (trimmed === '' || trimmed === 'null' || trimmed === '~') return '';
  const unquoted = trimmed.replace(/^['"]|['"]$/g, '');
  if (unquoted === 'true') return 'true';
  if (unquoted === 'false') return 'false';
  return unquoted;
}

function isListItem(text: string): boolean {
  return text === '-' || text.startsWith('- ');
}

function parseBlock(lines: Line[], index: number, indent: number): [YamlValue, number] {
  const first = lines[index];
  if (isListItem(first.text)) return parseList(lines, index, indent);
  return parseMap(lines, index, indent);
}

function parseMap(lines: Line[], start: number, indent: number): [{ [k: string]: YamlValue }, number] {
  const map: { [k: string]: YamlValue } = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < indent) break;
    if (isListItem(line.text)) break;
    if (line.indent > indent) {
      i += 1;
      continue;
    }
    const sep = line.text.indexOf(':');
    if (sep === -1) {
      i += 1;
      continue;
    }
    const key = line.text.slice(0, sep).trim();
    const rest = line.text.slice(sep + 1).trim();
    if (rest === '') {
      // 子块：可能是列表（可能缩进更深，甚至同缩进的 "-")
      const next = lines[i + 1];
      if (next && next.indent >= indent) {
        const [value, consumed] = parseBlock(lines, i + 1, next.indent);
        map[key] = value;
        i = consumed;
        continue;
      }
      map[key] = '';
      i += 1;
      continue;
    }
    map[key] = scalar(rest);
    i += 1;
  }
  return [map, i];
}

function parseList(lines: Line[], start: number, indent: number): [YamlValue[], number] {
  const list: YamlValue[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < indent) break;
    if (!isListItem(line.text)) {
      if (line.indent > indent) {
        i += 1;
        continue;
      }
      break;
    }
    const inline = line.text.replace(/^-\s*/, '');
    const sep = inline.indexOf(':');
    if (sep > 0) {
      // list item 本身是一个 map，把该行当作 map 的第一行
      const virtual: Line[] = [
        { indent: line.indent, text: inline },
        ...lines.slice(i + 1).filter((l) => l.indent > line.indent),
      ];
      const [map] = parseMap(virtual, 0, line.indent);
      // 跳过属于该 map 的后续行
      let j = i + 1;
      while (j < lines.length && lines[j].indent > line.indent) j += 1;
      list.push(map);
      i = j;
      continue;
    }
    list.push(scalar(inline));
    i += 1;
  }
  return [list, i];
}

export function parseYaml(src: string): { [k: string]: YamlValue } {
  const lines = parseLines(src);
  if (!lines.length) return {};
  const [map] = parseMap(lines, 0, lines[0].indent);
  return map;
}

export function asArray(value: YamlValue | undefined): YamlValue[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === '') return [];
  return [value];
}

export function asString(value: YamlValue | undefined, fallback = ''): string {
  if (typeof value === 'string') return value;
  return fallback;
}
