import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { docsApi } from '@/lib/api'

const DOCS_KEY = ['documents']

export function useDocuments() {
  return useQuery({
    queryKey: DOCS_KEY,
    queryFn: docsApi.list,
  })
}

export function useUploadDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => docsApi.upload(file),
    onSuccess: () => qc.invalidateQueries({ queryKey: DOCS_KEY }),
  })
}

export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => docsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: DOCS_KEY }),
  })
}
