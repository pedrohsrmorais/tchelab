import { useState, useEffect, useCallback } from 'react'

export function useApi(apiFn, deps = [], opts = {}) {
  const [data, setData] = useState(opts.initial ?? null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const execute = useCallback(async (...args) => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFn(...args)
      // apiFn may return null/undefined to signal "nothing to fetch" (e.g. conditional calls)
      if (res == null) { setLoading(false); return null }
      setData(res.data?.data ?? res.data)
      return res.data?.data ?? res.data
    } catch (e) {
      setError(e.response?.data?.error?.message || e.message)
      throw e
    } finally {
      setLoading(false)
    }
  }, deps) // eslint-disable-line

  useEffect(() => { execute() }, [execute]) // eslint-disable-line

  return { data, loading, error, refetch: execute }
}

export function useMutation(apiFn) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const mutate = useCallback(async (...args) => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFn(...args)
      return res.data?.data ?? res.data
    } catch (e) {
      const msg = e.response?.data?.error?.message || e.message
      setError(msg)
      throw e
    } finally {
      setLoading(false)
    }
  }, [apiFn])

  return { mutate, loading, error }
}
