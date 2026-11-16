import { resolve, relative } from 'node:path';
import { API } from 'typescript/unstable/sync';
import { SyntaxKind } from 'typescript/unstable/ast';
import type { Node } from 'typescript/unstable/ast';

// TypeScript 7 supplies its own syntax tree; keep this check on the same compiler.
const api = new API();
try {
  using snapshot = api.updateSnapshot({ openProjects: [resolve('tsconfig.json')] });
  const project = snapshot.getProject(resolve('tsconfig.json'));
  if (!project) throw new Error('TypeScript project could not be loaded');
  const violations: string[] = [];
  for (const file of project.rootFiles) {
    const candidate = project.program.getSourceFile(file);
    if (!candidate) throw new Error(`Missing TypeScript source: ${file}`);
    const source = candidate;
    function visit(node: Node): void {
      const text = node.getText(source);
      const forbidden = node.kind === SyntaxKind.AnyKeyword
        || node.kind === SyntaxKind.NonNullExpression
        || node.kind === SyntaxKind.TypeAssertionExpression
        || (node.kind === SyntaxKind.ExclamationToken && (node.parent.kind === SyntaxKind.PropertyDeclaration || node.parent.kind === SyntaxKind.VariableDeclaration))
        || (node.kind === SyntaxKind.AsExpression && !text.endsWith(' as const'));
      if (forbidden) {
        const line = source.getFullText().slice(0, node.getStart(source)).split('\n').length;
        violations.push(`${relative(process.cwd(), file)}:${line}: use validated, narrowed types instead of ${text}`);
      }
      node.forEachChild(visit);
    }
    visit(source);
  }
  if (violations.length) {
    console.error(violations.join('\n'));
    process.exitCode = 1;
  } else console.info(JSON.stringify({ check: 'type-discipline', files: project.rootFiles.length, violations: 0 }));
} finally {
  api.close();
}
