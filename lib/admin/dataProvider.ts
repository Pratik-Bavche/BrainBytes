"use client";

import { DataProvider } from "react-admin";
import * as courseActions from "@/actions/admin/courseActions";
import * as unitActions from "@/actions/admin/unitActions";
import * as lessonActions from "@/actions/admin/lessonActions";
import * as challengeActions from "@/actions/admin/challengeActions";
import * as challengeOptionActions from "@/actions/admin/challengeOptionActions";
import { GetListParams } from "@/actions/admin/types";

// Map resource names to their specific action modules
const resourceActionMap = {
  courses: courseActions,
  units: unitActions,
  lessons: lessonActions,
  challenges: challengeActions,
  challengeOptions: challengeOptionActions,
};

type ResourceName = keyof typeof resourceActionMap;

// Helper to get the correct action module for a resource
const getActions = (resource: string) => {
  return resourceActionMap[resource as ResourceName] as any;
};

export const dataProvider: DataProvider = {
  getList: (resource, params) => {
    const actions = getActions(resource);
    return actions.getList(params as GetListParams);
  },

  getOne: (resource, params) => {
    const actions = getActions(resource);
    return actions.getOne(Number(params.id));
  },

  getMany: (resource, params) => {
    const actions = getActions(resource);
    return actions.getMany(params.ids.map(Number));
  },

  getManyReference: (resource, params) => {
    const actions = getActions(resource);
    const { page, perPage } = params.pagination;
    const { field, order } = params.sort;
    const filter = { ...params.filter, [params.target]: params.id };

    const newParams: GetListParams = {
      pagination: { page, perPage },
      sort: { field, order },
      filter,
    };
    return actions.getList(newParams);
  },

  create: (resource, params) => {
    const actions = getActions(resource);
    return actions.create(params.data);
  },

  update: (resource, params) => {
    const actions = getActions(resource);
    return actions.update(Number(params.id), params.data);
  },

  // FIX: Added the missing updateMany function
  updateMany: async (resource, params) => {
    const actions = getActions(resource);
    const results = await Promise.all(
      params.ids.map((id) => actions.update(Number(id), params.data))
    );
    return { data: results.map((result) => result.data.id) };
  },

  delete: (resource, params) => {
    const actions = getActions(resource);
    return actions.delete(Number(params.id));
  },

  deleteMany: async (resource, params) => {
    const actions = getActions(resource);
    const results = await Promise.all(
      params.ids.map((id) => actions.delete(Number(id)))
    );
    return { data: results.map((result) => result.data.id) };
  },
};