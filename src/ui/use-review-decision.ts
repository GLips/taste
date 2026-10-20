import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { acceptReviewGroup, decideReviewBelief } from "../server/review-functions.ts";
import type { DecisionOutcome } from "../shared/vocabulary.ts";

/**
 * Decides one belief. A refused decision (someone decided first, a revision already retired its target) comes back
 * as `error` for the card to show inline; every query is refreshed either way so the card shows the store as it is.
 */
export function useReviewDecision(target: string) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | undefined>(undefined);
  const mutation = useMutation({
    mutationFn: (input: { outcome: DecisionOutcome; reason?: string }) =>
      decideReviewBelief({ data: { target, outcome: input.outcome, ...(input.reason && { reason: input.reason }) } }),
    onMutate: () => setError(undefined),
    onSuccess: (result) => setError(result.ok ? undefined : result.message),
    onError: (failure) => setError(failure.message),
    onSettled: () => queryClient.invalidateQueries(),
  });
  return {
    decide: (outcome: DecisionOutcome, reason?: string) => mutation.mutateAsync(reason === undefined ? { outcome } : { outcome, reason }),
    pending: mutation.isPending,
    error,
    clearError: () => setError(undefined),
  };
}

/** Accept-all for an inbox group; failures are per card, so the rest of the group still lands. */
export function useAcceptReviewGroup() {
  const queryClient = useQueryClient();
  const [failures, setFailures] = useState<ReadonlyArray<{ target: string; message: string }>>([]);
  const mutation = useMutation({
    mutationFn: (targets: ReadonlyArray<string>) => acceptReviewGroup({ data: { targets: [...targets] } }),
    onMutate: () => setFailures([]),
    onSuccess: (results) =>
      setFailures(results.flatMap((result) => (result.ok ? [] : [{ target: result.target, message: result.message }]))),
    onError: (failure) => setFailures([{ target: "", message: failure.message }]),
    onSettled: () => queryClient.invalidateQueries(),
  });
  return { acceptAll: mutation.mutate, pending: mutation.isPending, failures };
}
