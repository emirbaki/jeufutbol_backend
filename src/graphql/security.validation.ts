import { ValidationContext, ASTVisitor, GraphQLError } from 'graphql';

export function createSecurityValidationRules(options: {
    maxAliases: number;
    maxDirectives: number;
}) {
    return [
        // Rule 1: Limit Aliases
        (context: ValidationContext): ASTVisitor => {
            let aliasCount = 0;
            return {
                Field(node) {
                    if (node.alias) {
                        aliasCount++;
                        if (aliasCount > options.maxAliases) {
                            context.reportError(
                                new GraphQLError(
                                    `Too many aliases. Maximum allowed is ${options.maxAliases}.`,
                                    { nodes: node }
                                )
                            );
                        }
                    }
                },
            };
        },

        // Rule 2: Limit Directives
        (context: ValidationContext): ASTVisitor => {
            let directiveCount = 0;
            return {
                Directive(node) {
                    directiveCount++;
                    if (directiveCount > options.maxDirectives) {
                        context.reportError(
                            new GraphQLError(
                                `Too many directives. Maximum allowed is ${options.maxDirectives}.`,
                                { nodes: node }
                            )
                        );
                    }
                },
            };
        },

        // Rule 3: Prevent Field Duplication (Simple check for same level duplicates)
        (context: ValidationContext): ASTVisitor => {
            return {
                SelectionSet(node) {
                    const seenFields = new Set<string>();
                    for (const selection of node.selections) {
                        if (selection.kind === 'Field') {
                            const fieldName = selection.alias?.value || selection.name.value;
                            if (seenFields.has(fieldName)) {
                                context.reportError(
                                    new GraphQLError(
                                        `Duplicate field "${fieldName}" is not allowed.`,
                                        { nodes: selection }
                                    )
                                );
                            }
                            seenFields.add(fieldName);
                        }
                    }
                },
            };
        },
    ];
}
