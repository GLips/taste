import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
  fetchBeliefDetail,
  fetchBeliefList,
  fetchInboxGroups,
  fetchRecallInspection,
  fetchReviewStoreInfo,
} from "../server/review-functions.ts";
import type { BeliefStatus } from "../shared/vocabulary.ts";

/** Every screen re-reads the store this often: agents write to it from other processes, and there is no push. */
export const REVIEW_POLL_MS = 1_000;

export const reviewStoreInfoQuery = queryOptions({
  queryKey: ["store-info"],
  queryFn: () => fetchReviewStoreInfo(),
  refetchInterval: REVIEW_POLL_MS,
});

export const inboxGroupsQuery = queryOptions({
  queryKey: ["inbox"],
  queryFn: () => fetchInboxGroups(),
  refetchInterval: REVIEW_POLL_MS,
});

export const beliefListQuery = (filter: { status?: BeliefStatus | undefined; scope?: string | undefined }) =>
  queryOptions({
    queryKey: ["beliefs", filter.status ?? null, filter.scope ?? null],
    queryFn: () =>
      fetchBeliefList({
        data: { ...(filter.status && { status: filter.status }), ...(filter.scope && { scope: filter.scope }) },
      }),
    refetchInterval: REVIEW_POLL_MS,
    // A filter change keeps the old rows up until the new ones land, instead of flashing a loader.
    placeholderData: keepPreviousData,
  });

export const beliefDetailQuery = (id: string) =>
  queryOptions({
    queryKey: ["belief", id],
    queryFn: () => fetchBeliefDetail({ data: { id } }),
    refetchInterval: REVIEW_POLL_MS,
  });

export const recallInspectionQuery = (input: { query: string; scope?: string | undefined; history: boolean }) =>
  queryOptions({
    queryKey: ["recall", input.query, input.scope ?? null, input.history],
    queryFn: () =>
      fetchRecallInspection({
        data: { query: input.query, history: input.history, ...(input.scope && { scope: input.scope }) },
      }),
    refetchInterval: REVIEW_POLL_MS,
    enabled: input.query.trim() !== "",
    placeholderData: keepPreviousData,
  });
