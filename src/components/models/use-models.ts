"use client"

import { useEffect, useState } from "react"

import type { ModelConfigDto } from "@/types/api"

export function useModels() {
  const [models, setModels] = useState<ModelConfigDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/models")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load models (${res.status})`)
        return (await res.json()) as ModelConfigDto[]
      })
      .then((data) => {
        if (!cancelled) setModels(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { models, loading, error }
}
