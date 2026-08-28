import { Request } from 'express';

export interface PaginationParams {
  skip: number;
  take: number;
  page: number;
  pageSize: number;
}

export function getPagination(req: Request, defaultPageSize = 20, maxPageSize = 100): PaginationParams {
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const pageSize = Math.min(maxPageSize, Math.max(1, Number(req.query.pageSize ?? defaultPageSize) || defaultPageSize));
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

export function paginatedResult<T>(items: T[], total: number, pagination: PaginationParams) {
  return {
    items,
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.ceil(total / pagination.pageSize) || 1,
    },
  };
}
