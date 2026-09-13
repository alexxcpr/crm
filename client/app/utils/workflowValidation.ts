export interface WorkflowValidationIssue {
  code: string
  message: string
  nodeId?: string
  field?: string
}

export interface WorkflowValidationNode {
  id: string
  name?: string
  label?: string
}

export function formatWorkflowValidationErrors(
  issues: WorkflowValidationIssue[],
  nodes: WorkflowValidationNode[]
): string[] {
  const nodeNames = new Map(
    nodes.map(node => [node.id, node.name || node.label || node.id])
  )
  const seen = new Set<string>()

  return issues.flatMap((issue) => {
    const key = JSON.stringify([
      issue.nodeId ?? '',
      issue.code,
      issue.field ?? '',
      issue.message
    ])
    if (seen.has(key)) return []
    seen.add(key)

    if (!issue.nodeId) return [issue.message]
    const nodeName = nodeNames.get(issue.nodeId) ?? issue.nodeId
    return [`${nodeName}: ${issue.message}`]
  })
}
