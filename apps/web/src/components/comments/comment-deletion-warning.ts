export function getCommentDeletionDescription(input: {
  mayCreateEterisDebt: boolean;
  settledXp: number;
}) {
  if (input.settledXp === 0) {
    return "¿Estás seguro de que quieres eliminar este comentario? Esta acción no se puede deshacer.";
  }

  return `Eliminar este comentario revertirá ${input.settledXp} Account XP${input.mayCreateEterisDebt ? " y puede dejar tu Billetera Eteris con deuda" : ""}. Esta acción no se puede deshacer.`;
}
