import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { eventsApi, type CalendarEventCreate, type CalendarEventUpdate } from '@/lib/api'

export function useEvents() {
  return useQuery({
    queryKey: ['events'],
    queryFn: eventsApi.list,
    refetchInterval: 5000,
  })
}

export function useCreateEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CalendarEventCreate) => eventsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  })
}

export function useUpdateEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: CalendarEventUpdate }) =>
      eventsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  })
}

export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => eventsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  })
}
