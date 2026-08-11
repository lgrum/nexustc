export function getReviewDeletionDescription(input: {
  mayCreateEterisDebt: boolean;
  settledXp: number;
}) {
  if (input.settledXp === 0) {
    return "¿Estás seguro de que quieres eliminar tu valoración? Esta acción no se puede deshacer.";
  }

  return `Eliminar esta valoración revertirá ${input.settledXp} Account XP${input.mayCreateEterisDebt ? " y puede dejar tu Billetera Eteris con deuda" : ""}. Esta acción no se puede deshacer.`;
}
