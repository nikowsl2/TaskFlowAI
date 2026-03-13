import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { profileApi, UserProfileUpdate } from '../lib/api'

export function useProfile() {
  return useQuery({ queryKey: ['profile'], queryFn: profileApi.get })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UserProfileUpdate) => profileApi.update(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  })
}
