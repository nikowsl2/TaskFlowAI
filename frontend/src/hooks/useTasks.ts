import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tasksApi, type TaskCreate, type TaskUpdate } from '@/lib/api'

const TASKS_KEY = ['tasks']

export function useTasks() {
  return useQuery({
    queryKey: TASKS_KEY,
    queryFn: tasksApi.list,
    refetchInterval: 5000,
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TaskCreate) => tasksApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: TaskUpdate }) => tasksApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => tasksApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  })
}
