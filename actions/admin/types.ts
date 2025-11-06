// Defines the params shape react-admin sends for getList
export type GetListParams = {
  pagination: {
    page: number;
    perPage: number;
  };
  sort: {
    field: string;
    order: "ASC" | "DESC";
  };
  filter: any;
};