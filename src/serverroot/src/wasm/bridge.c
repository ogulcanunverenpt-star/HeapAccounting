/* The i32 inputs are widened before addition; every result fits in i64. */
long long heap_accounting_add_minor(int left, int right)
{
    return (long long)left + (long long)right;
}
