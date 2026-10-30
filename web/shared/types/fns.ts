export interface User {
  uid: number
  username: string
  email: string
  avatar?: string
}
export interface LoginUser extends User {
  token: string
  tokenId: number
}
export interface Vault {
  id: number
  vault: string
  noteCount: number
  fileCount: number
}
export interface Note {
  id: number
  path: string
  content?: string
  mtime: number
}
export interface Page<T> {
  list: T[]
  pager: { page: number; pageSize: number; totalRows: number }
}
export interface FnsResponse<T> {
  code: number
  status?: boolean
  message?: string
  data: T
}
