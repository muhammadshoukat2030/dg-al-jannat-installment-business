import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Smart Progressive / Infinite Scroll hook with offline fallback & deduplication.
 * Loads records in controlled batches, automatically loads next page on scroll,
 * avoids duplicate keys, and falls back to local IndexedDB when offline.
 */
export function useSmartScroll({
  fetchOnline,
  fetchOffline,
  filters = {},
  limit = 20,
  deps = [],
}) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [isOfflineData, setIsOfflineData] = useState(false);

  const observerRef = useRef(null);
  const sentinelRef = useRef(null);
  const pageRef = useRef(page);
  pageRef.current = page;

  const hasMore = page < totalPages;

  // Load a specific page
  const loadPage = useCallback(
    async (targetPage, isInitial = false) => {
      if (isInitial) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

      try {
        let result;
        if (isOnline && fetchOnline) {
          try {
            result = await fetchOnline({ page: targetPage, limit, ...filters });
            setIsOfflineData(false);
          } catch (onlineErr) {
            // Network failure fallback
            if (fetchOffline) {
              result = await fetchOffline({ page: targetPage, limit, ...filters });
              setIsOfflineData(true);
            } else {
              throw onlineErr;
            }
          }
        } else if (fetchOffline) {
          result = await fetchOffline({ page: targetPage, limit, ...filters });
          setIsOfflineData(true);
        } else {
          result = { data: [], total: 0, pages: 1 };
        }

        const newRecords = result.data || [];
        const newTotal = result.total !== undefined ? result.total : newRecords.length;
        const newPages = result.pages || Math.ceil(newTotal / limit) || 1;

        setTotal(newTotal);
        setTotalPages(newPages);

        setItems((prev) => {
          if (isInitial || targetPage === 1) {
            return newRecords;
          }
          // Deduplicate by _id or id or operationId
          const seen = new Set(prev.map((i) => i._id || i.id || i.operationId));
          const additions = newRecords.filter((i) => !seen.has(i._id || i.id || i.operationId));
          return [...prev, ...additions];
        });
      } catch (err) {
        setError(err.message || 'Failed to load records.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchOnline, fetchOffline, limit, JSON.stringify(filters)]
  );

  // Reset to page 1 on filter/dependency change
  useEffect(() => {
    setPage(1);
    loadPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters), ...deps]);

  // Load next page when scrolling near sentinel
  const loadMore = useCallback(() => {
    if (!loading && !loadingMore && pageRef.current < totalPages) {
      const nextPage = pageRef.current + 1;
      setPage(nextPage);
      loadPage(nextPage, false);
    }
  }, [loading, loadingMore, totalPages, loadPage]);

  // IntersectionObserver on sentinelRef
  useEffect(() => {
    if (loading || loadingMore || !hasMore) return;

    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '250px' }
    );

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current);
    }

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [loading, loadingMore, hasMore, loadMore]);

  const refresh = useCallback(() => {
    setPage(1);
    loadPage(1, true);
  }, [loadPage]);

  return {
    items,
    setItems,
    loading,
    loadingMore,
    hasMore,
    total,
    error,
    refresh,
    sentinelRef,
    isOfflineData,
  };
}
