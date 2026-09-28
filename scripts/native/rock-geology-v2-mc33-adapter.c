// Repository-only adapter for the pinned MIT MC33 v5.5 bake-off reference.
// The library is intentionally not copied into ToonLab. Compile this file with
// an include path pointing at dvega68/MC33_c_header-only commit
// eef8f8f4d70527af74b988869e34f887ef9ed7ba.

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define GRD_TYPE_SIZE 8
#define GRD_ORTHOGONAL
#define USE_MM_RSQRT_SS 0
#define marching_cubes_33_c_implementation
#include "marching_cubes_33_c.h"

static int read_exact(void *target, size_t size, size_t count, FILE *stream) {
  return fread(target, size, count, stream) == count;
}

static int write_exact(const void *source, size_t size, size_t count, FILE *stream) {
  return fwrite(source, size, count, stream) == count;
}

int main(int argc, char **argv) {
  if (argc != 3) {
    fprintf(stderr, "usage: %s input.tlgrid output.tlmesh\n", argv[0]);
    return 64;
  }
  FILE *input = fopen(argv[1], "rb");
  if (!input) {
    perror("open input");
    return 66;
  }
  char magic[8];
  uint32_t point_dims[3];
  double origin[3];
  double spacing[3];
  if (!read_exact(magic, 1, sizeof magic, input)
      || memcmp(magic, "TLGRDv1\0", sizeof magic) != 0
      || !read_exact(point_dims, sizeof(uint32_t), 3, input)
      || !read_exact(origin, sizeof(double), 3, input)
      || !read_exact(spacing, sizeof(double), 3, input)) {
    fprintf(stderr, "invalid ToonLab scalar-grid header\n");
    fclose(input);
    return 65;
  }
  const size_t point_count = (size_t)point_dims[0] * point_dims[1] * point_dims[2];
  if (point_dims[0] < 2 || point_dims[1] < 2 || point_dims[2] < 2
      || point_count > SIZE_MAX / sizeof(double)) {
    fprintf(stderr, "invalid ToonLab scalar-grid dimensions\n");
    fclose(input);
    return 65;
  }
  double *values = (double *)malloc(point_count * sizeof(double));
  if (!values || !read_exact(values, sizeof(double), point_count, input)) {
    fprintf(stderr, "unable to read ToonLab scalar-grid values\n");
    free(values);
    fclose(input);
    return 65;
  }
  fclose(input);

  _GRD *grid = grid_from_data_pointer(point_dims[0], point_dims[1], point_dims[2], values);
  if (!grid) {
    fprintf(stderr, "MC33 rejected the scalar grid\n");
    free(values);
    return 70;
  }
  memcpy(grid->r0, origin, sizeof origin);
  memcpy(grid->d, spacing, sizeof spacing);
  MC33 *mc33 = create_MC33(grid);
  surface *result = mc33 ? calculate_isosurface(mc33, 0.0) : NULL;
  if (!result) {
    fprintf(stderr, "MC33 extraction failed\n");
    free_MC33(mc33);
    free_memory_grd(grid);
    free(values);
    return 70;
  }

  FILE *output = fopen(argv[2], "wb");
  if (!output) {
    perror("open output");
    free_surface_memory(result);
    free_MC33(mc33);
    free_memory_grd(grid);
    free(values);
    return 73;
  }
  const char output_magic[8] = "TLMSHv1";
  uint32_t counts[2] = { result->nV, result->nT };
  int ok = write_exact(output_magic, 1, sizeof output_magic, output)
    && write_exact(counts, sizeof(uint32_t), 2, output)
    && write_exact(result->V, sizeof(double) * 3, result->nV, output)
    && write_exact(result->T, sizeof(uint32_t) * 3, result->nT, output);
  if (fclose(output) != 0) ok = 0;

  free_surface_memory(result);
  free_MC33(mc33);
  free_memory_grd(grid);
  free(values);
  if (!ok) {
    fprintf(stderr, "unable to write ToonLab mesh output\n");
    return 74;
  }
  return 0;
}
