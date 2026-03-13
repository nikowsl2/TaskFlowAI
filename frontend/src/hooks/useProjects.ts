import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { projectsApi, ProjectCreate, ProjectUpdate } from '../lib/api'

export function useProjectEpisodes(projectId: number) {
  return useQuery({
    queryKey: ['episodes', projectId],
    queryFn: () => projectsApi.getEpisodes(projectId),
  })
}

export function useDeleteEpisode(projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (episodeId: string) => projectsApi.deleteEpisode(projectId, episodeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['episodes', projectId] }),
  })
}

export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: projectsApi.list })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ProjectCreate) => projectsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ProjectUpdate }) =>
      projectsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => projectsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useLogEpisode() {
  return useMutation({
    mutationFn: ({ id, memory_text }: { id: number; memory_text: string }) =>
      projectsApi.logEpisode(id, memory_text),
  })
}
